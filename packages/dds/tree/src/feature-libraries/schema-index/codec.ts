/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "@fluidframework/core-utils/internal";
import { lowestMinVersionForCollab } from "@fluidframework/runtime-utils/internal";

import {
	ClientVersionDispatchingCodecBuilder,
	type CodecWriteOptions,
	FluidClientVersion,
	type IJsonCodec,
} from "../../codec/index.js";
import {
	SchemaFormatVersion,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	decodeFieldSchema,
	encodeFieldSchemaV1,
	encodeFieldSchemaV2,
	storedSchemaDecodeDispatcher,
} from "../../core/index.js";
import { brand } from "../../util/index.js";

import { Format as FormatV1 } from "./formatV1.js";
import { Format as FormatV2 } from "./formatV2.js";

/**
 * Create a schema codec.
 * @param options - Specifies common codec options, including `minVersionForCollab` and which `validator` to use.
 * @param writeVersionOverride - The schema version to write. If not provided, the version will be derived from `minVersionForCollab`.
 * TODO: Currently this parameter is provided when it probably should not be. Users of it should probably allow the automatic selection to occur and this parameter can be removed.
 * Any case where an override is actually required can use `options` to do so.
 * @returns The composed codec.
 *
 * @privateRemarks We should consider using the Shared Tree format version instead as it may be more valuable for application authors than the schema version.
 *
 * TODO: replace use of this with schemaCodecBuilder.build(...).
 */
export function makeSchemaCodec(
	options: CodecWriteOptions,
	writeVersionOverride?: SchemaFormatVersion,
): IJsonCodec<TreeStoredSchema> {
	const overrides = new Map(options.writeVersionOverrides ?? []);
	if (writeVersionOverride !== undefined) {
		overrides.set(schemaCodecBuilder.name, writeVersionOverride);
	}
	return schemaCodecBuilder.build({ ...options, writeVersionOverrides: overrides });
}

function encodeRepoV1(repo: TreeStoredSchema): FormatV1 {
	const nodeSchema = encodeNodeSchema(repo, (schema) => schema.encodeV1());
	const rootFieldSchema = encodeFieldSchemaV1(repo.rootFieldSchema);
	return {
		version: SchemaFormatVersion.v1,
		nodes: nodeSchema,
		root: rootFieldSchema,
	};
}

function encodeRepoV2(repo: TreeStoredSchema): FormatV2 {
	const nodeSchema = encodeNodeSchema(repo, (schema) => schema.encodeV2());
	const rootFieldSchema = encodeFieldSchemaV2(repo.rootFieldSchema);
	return {
		version: SchemaFormatVersion.v2,
		nodes: nodeSchema,
		root: rootFieldSchema,
	};
}

/**
 * Shared logic for encoding node schemas.
 * @param repo - The stored schema to encode.
 * @param encodeValue - A function which encodes a single node schema.
 * @returns The encoded node schema.
 */
function encodeNodeSchema<TFormat>(
	repo: TreeStoredSchema,
	encodeValue: (schema: TreeNodeStoredSchema) => TFormat,
): Record<string, TFormat> {
	const nodeSchema: Record<string, TFormat> = Object.create(null);
	for (const name of [...repo.nodeSchema.keys()].sort()) {
		const schema = repo.nodeSchema.get(name) ?? fail(0xb28 /* missing schema */);
		Object.defineProperty(nodeSchema, name, {
			enumerable: true,
			configurable: true,
			writable: true,
			value: encodeValue(schema),
		});
	}

	return nodeSchema;
}

function decodeV1(f: FormatV1): TreeStoredSchema {
	const nodeSchema: Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> = new Map();
	for (const [key, schema] of Object.entries(f.nodes)) {
		const storedSchemaDecoder = storedSchemaDecodeDispatcher.dispatch(schema);

		// No metadata in v1, so pass undefined
		nodeSchema.set(brand(key), storedSchemaDecoder(undefined));
	}
	return {
		rootFieldSchema: decodeFieldSchema(f.root),
		nodeSchema,
	};
}

function decodeV2(f: FormatV2): TreeStoredSchema {
	const nodeSchema: Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> = new Map();
	for (const [key, schema] of Object.entries(f.nodes)) {
		const storedSchemaDecoder = storedSchemaDecodeDispatcher.dispatch(schema.kind);

		// Pass in the node metadata
		nodeSchema.set(brand(key), storedSchemaDecoder(schema.metadata));
	}
	return {
		rootFieldSchema: decodeFieldSchema(f.root),
		nodeSchema,
	};
}

/**
 * Creates a codec which performs synchronous monolithic encoding of schema content.
 */
export const schemaCodecBuilder = ClientVersionDispatchingCodecBuilder.build("Schema", {
	[lowestMinVersionForCollab]: {
		formatVersion: SchemaFormatVersion.v1,
		codec: {
			encode: (data: TreeStoredSchema) => encodeRepoV1(data),
			decode: (data: FormatV1) => decodeV1(data),
			schema: FormatV1,
		},
	},
	[FluidClientVersion.v2_43]: {
		formatVersion: SchemaFormatVersion.v2,
		codec: {
			encode: (data: TreeStoredSchema) => encodeRepoV2(data),
			decode: (data: FormatV2) => decodeV2(data),
			schema: FormatV2,
		},
	},
});

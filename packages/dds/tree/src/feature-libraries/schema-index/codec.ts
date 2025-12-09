/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	getConfigForMinVersionForCollab,
	lowestMinVersionForCollab,
} from "@fluidframework/runtime-utils/internal";

import {
	type CodecTree,
	type CodecWriteOptions,
	FluidClientVersion,
	type ICodecFamily,
	type ICodecOptions,
	type IJsonCodec,
	makeCodecFamily,
	makeVersionDispatchingCodec,
	makeVersionedValidatedCodec,
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
import { brand, type JsonCompatible } from "../../util/index.js";

import { Format as FormatV1 } from "./formatV1.js";
import { Format as FormatV2 } from "./formatV2.js";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";

/**
 * Convert a MinimumVersionForCollab to a SchemaFormatVersion.
 * @param clientVersion - The MinimumVersionForCollab to convert.
 * @returns The SchemaFormatVersion that corresponds to the provided MinimumVersionForCollab.
 */
export function clientVersionToSchemaVersion(
	clientVersion: MinimumVersionForCollab,
): SchemaFormatVersion {
	return brand(
		getConfigForMinVersionForCollab(clientVersion, {
			[lowestMinVersionForCollab]: SchemaFormatVersion.v1,
			[FluidClientVersion.v2_43]: SchemaFormatVersion.v2,
		}),
	);
}

export function getCodecTreeForSchemaFormat(
	clientVersion: MinimumVersionForCollab,
): CodecTree {
	return { name: "Schema", version: clientVersionToSchemaVersion(clientVersion) };
}

/**
 * Create a schema codec.
 * @param options - Specifies common codec options, including `minVersionForCollab` and which `validator` to use.
 * @param writeVersionOverride - The schema version to write. If not provided, the version will be derived from `minVersionForCollab`.
 * @returns The composed codec.
 *
 * @privateRemarks We should consider using the Shared Tree format version instead as it may be more valuable for application authors than the schema version.
 */
export function makeSchemaCodec(
	options: CodecWriteOptions,
	writeVersionOverride?: SchemaFormatVersion,
): IJsonCodec<TreeStoredSchema> {
	const family = makeSchemaCodecs(options);
	return makeVersionDispatchingCodec(family, {
		...options,
		writeVersion:
			writeVersionOverride ?? clientVersionToSchemaVersion(options.minVersionForCollab),
	});
}

/**
 * Create a family of schema codecs.
 * @param options - Specifies common codec options, including which `validator` to use.
 * @returns The composed codec family.
 */
export function makeSchemaCodecs(options: ICodecOptions): ICodecFamily<TreeStoredSchema> {
	return makeCodecFamily([
		[SchemaFormatVersion.v1, makeSchemaCodecV1(options)],
		[SchemaFormatVersion.v2, makeSchemaCodecV2(options)],
	]);
}

/**
 * Encode an in-memory TreeStoredSchema into the specified format version.
 * @param repo - The in-memory schema.
 * @param version - The schema write version.
 * @returns The encoded schema.
 */
export function encodeRepo(
	repo: TreeStoredSchema,
	version: SchemaFormatVersion,
): JsonCompatible {
	switch (version) {
		case SchemaFormatVersion.v1:
			return encodeRepoV1(repo) as JsonCompatible;
		case SchemaFormatVersion.v2:
			return encodeRepoV2(repo) as JsonCompatible;
		default:
			unreachableCase(version);
	}
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
 * @param options - Specifies common codec options, including which `validator` to use.
 * @returns The codec.
 */
function makeSchemaCodecV1(options: ICodecOptions): IJsonCodec<TreeStoredSchema, FormatV1> {
	return makeVersionedValidatedCodec(options, new Set([SchemaFormatVersion.v1]), FormatV1, {
		encode: (data: TreeStoredSchema) => encodeRepoV1(data),
		decode: (data: FormatV1) => decodeV1(data),
	});
}

/**
 * Creates a codec which performs synchronous monolithic encoding of schema content.
 * @param options - Specifies common codec options, including which `validator` to use.
 * @returns The codec.
 */
function makeSchemaCodecV2(options: ICodecOptions): IJsonCodec<TreeStoredSchema, FormatV2> {
	return makeVersionedValidatedCodec(options, new Set([SchemaFormatVersion.v2]), FormatV2, {
		encode: (data: TreeStoredSchema) => encodeRepoV2(data),
		decode: (data: FormatV2) => decodeV2(data),
	});
}

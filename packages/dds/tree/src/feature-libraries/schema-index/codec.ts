/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	type ICodecFamily,
	type ICodecOptions,
	type IJsonCodec,
	makeCodecFamily,
	makeVersionDispatchingCodec,
	makeVersionedValidatedCodec,
} from "../../codec/index.js";
import {
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	decodeFieldSchema,
	encodeFieldSchema,
	schemaFormatV1,
	storedSchemaDecodeDispatcher,
} from "../../core/index.js";
import { brand, type JsonCompatible } from "../../util/index.js";

import { Format as FormatV1 } from "./formatV1.js";

/**
 * Schema codec write version.
 */
export enum SchemaCodecVersion {
	v1 = 1,
}

/**
 * Create a schema codec.
 * @param options - Specifies common codec options, including which `validator` to use.
 * @param writeVersion - The schema write version.
 * @returns The composed codec.
 */
export function makeSchemaCodec(
	options: ICodecOptions,
	writeVersion: SchemaCodecVersion,
): IJsonCodec<TreeStoredSchema> {
	const family = makeSchemaCodecs(options);
	return makeVersionDispatchingCodec(family, { ...options, writeVersion });
}

/**
 * Create a family of schema codecs.
 * @param options - Specifies common codec options, including which `validator` to use.
 * @returns The composed codec family.
 */
export function makeSchemaCodecs(options: ICodecOptions): ICodecFamily<TreeStoredSchema> {
	return makeCodecFamily([[SchemaCodecVersion.v1, makeSchemaCodecV1(options)]]);
}

/**
 * Encode an in-memory TreeStoredSchema into the specified format version.
 * @param repo - The in-memory schema.
 * @param version - The schema write version.
 * @returns The encoded schema.
 */
export function encodeRepo(
	repo: TreeStoredSchema,
	version: SchemaCodecVersion,
): JsonCompatible {
	switch (version) {
		case SchemaCodecVersion.v1:
			return encodeRepoV1(repo);
		default:
			unreachableCase(version);
	}
}

function encodeRepoV1(repo: TreeStoredSchema): FormatV1 {
	const nodeSchema: Record<string, schemaFormatV1.TreeNodeSchemaDataFormat> =
		Object.create(null);
	const rootFieldSchema = encodeFieldSchema(repo.rootFieldSchema);
	for (const name of [...repo.nodeSchema.keys()].sort()) {
		const schema = repo.nodeSchema.get(name) ?? fail(0xb28 /* missing schema */);
		Object.defineProperty(nodeSchema, name, {
			enumerable: true,
			configurable: true,
			writable: true,
			value: schema.encode(),
		});
	}
	return {
		version: schemaFormatV1.version,
		nodes: nodeSchema,
		root: rootFieldSchema,
	};
}

function decode(f: FormatV1): TreeStoredSchema {
	const nodeSchema: Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> = new Map();
	for (const [key, schema] of Object.entries(f.nodes)) {
		nodeSchema.set(brand(key), storedSchemaDecodeDispatcher.dispatch(schema));
	}
	return {
		rootFieldSchema: decodeFieldSchema(f.root),
		nodeSchema,
	};
}

/**
 * Creates a codec which performs synchronous monolithic encoding of schema content.
 * @param options - Specifies common codec options, including which `validator` to use.
 * @param version - The schema write version.
 * @returns The codec.
 */
function makeSchemaCodecV1(options: ICodecOptions): IJsonCodec<TreeStoredSchema, FormatV1> {
	return makeVersionedValidatedCodec(options, new Set([schemaFormatV1.version]), FormatV1, {
		encode: (data: TreeStoredSchema) => encodeRepoV1(data),
		decode: (data: FormatV1) => decode(data),
	});
}

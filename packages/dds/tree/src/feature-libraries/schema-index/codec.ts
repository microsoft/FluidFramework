/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	FluidClientVersion,
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
	encodeFieldSchemaV1,
	encodeFieldSchemaV2,
	type schemaFormatV1,
	type schemaFormatV2,
	storedSchemaDecodeDispatcher,
} from "../../core/index.js";
import { brand, type JsonCompatible } from "../../util/index.js";

import { Format as FormatV1 } from "./formatV1.js";
import { Format as FormatV2 } from "./formatV2.js";
import { SchemaCodecVersion } from "../../core/index.js";

/**
 * Convert a FluidClientVersion to a SchemaCodecVersion.
 * @param clientVersion - The FluidClientVersion to convert.
 * @returns The SchemaCodecVersion that corresponds to the provided FluidClientVersion.
 */
export function clientVersionToSchemaVersion(
	clientVersion: FluidClientVersion,
): SchemaCodecVersion {
	switch (clientVersion) {
		case FluidClientVersion.v2_0:
		case FluidClientVersion.v2_1:
		case FluidClientVersion.v2_2:
		case FluidClientVersion.v2_3:
			return SchemaCodecVersion.v1;
		case FluidClientVersion.v2_4:
			return SchemaCodecVersion.v2;
		default:
			unreachableCase(clientVersion);
	}
}

/**
 * Create a schema codec.
 * @param options - Specifies common codec options, including which `validator` to use.
 * @param writeVersion - The schema write version.
 * @returns The composed codec.
 *
 * @privateRemarks We should consider using the Shared Tree format version instead as it may be more valuable for application authors than the schema version.
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
	return makeCodecFamily([
		[SchemaCodecVersion.v1, makeSchemaCodecV1(options)],
		[SchemaCodecVersion.v2, makeSchemaCodecV2(options)],
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
	version: SchemaCodecVersion,
): JsonCompatible {
	switch (version) {
		case SchemaCodecVersion.v1:
			return encodeRepoV1(repo) as JsonCompatible;
		case SchemaCodecVersion.v2:
			return encodeRepoV2(repo) as JsonCompatible;
		default:
			unreachableCase(version);
	}
}

function encodeRepoV1(repo: TreeStoredSchema): FormatV1 {
	const nodeSchema: Record<string, schemaFormatV1.TreeNodeSchemaDataFormat> =
		Object.create(null);
	const rootFieldSchema = encodeFieldSchemaV1(repo.rootFieldSchema);
	for (const name of [...repo.nodeSchema.keys()].sort()) {
		const schema = repo.nodeSchema.get(name) ?? fail(0xb28 /* missing schema */);
		Object.defineProperty(nodeSchema, name, {
			enumerable: true,
			configurable: true,
			writable: true,
			value: schema.encodeV1(),
		});
	}
	return {
		version: SchemaCodecVersion.v1,
		nodes: nodeSchema,
		root: rootFieldSchema,
	};
}

function encodeRepoV2(repo: TreeStoredSchema): FormatV2 {
	const nodeSchema: Record<string, schemaFormatV2.TreeNodeSchemaDataFormat> =
		Object.create(null);
	const rootFieldSchema = encodeFieldSchemaV2(repo.rootFieldSchema);
	for (const name of [...repo.nodeSchema.keys()].sort()) {
		const schema = repo.nodeSchema.get(name) ?? fail(0xb28 /* missing schema */);
		Object.defineProperty(nodeSchema, name, {
			enumerable: true,
			configurable: true,
			writable: true,
			value: schema.encodeV2(),
		});
	}
	return {
		version: SchemaCodecVersion.v2,
		nodes: nodeSchema,
		root: rootFieldSchema,
	};
}

function decode(f: FormatV1 | FormatV2): TreeStoredSchema {
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
 * @returns The codec.
 */
function makeSchemaCodecV1(options: ICodecOptions): IJsonCodec<TreeStoredSchema, FormatV1> {
	return makeVersionedValidatedCodec(options, new Set([SchemaCodecVersion.v1]), FormatV1, {
		encode: (data: TreeStoredSchema) => encodeRepoV1(data),
		decode: (data: FormatV1) => decode(data),
	});
}

/**
 * Creates a codec which performs synchronous monolithic encoding of schema content.
 * @param options - Specifies common codec options, including which `validator` to use.
 * @returns The codec.
 */
function makeSchemaCodecV2(options: ICodecOptions): IJsonCodec<TreeStoredSchema, FormatV2> {
	return makeVersionedValidatedCodec(options, new Set([SchemaCodecVersion.v2]), FormatV2, {
		encode: (data: TreeStoredSchema) => encodeRepoV2(data),
		decode: (data: FormatV2) => decode(data),
	});
}

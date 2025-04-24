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
} from "../../codec/index.js";
import {
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	decodeFieldSchema,
	encodeFieldSchema,
	schemaFormatV1,
	schemaFormatV2,
	storedSchemaDecodeDispatcher,
	toTreeNodeSchemaDataFormat,
} from "../../core/index.js";
import { brand } from "../../util/index.js";

import type { Format as FormatV1 } from "./formatV1.js";
import type { Format as FormatV2 } from "./formatV2.js";

type Format = FormatV1 | FormatV2;

export function encodeRepo(repo: TreeStoredSchema, version: 1 | 2): Format {
	switch (version) {
		case 1:
			return encodeRepoV1(repo);
		case 2:
			return encodeRepoV2(repo);
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
			value: toTreeNodeSchemaDataFormat(schema.encode()),
		});
	}
	return {
		version: schemaFormatV1.version,
		nodes: nodeSchema,
		root: rootFieldSchema,
	};
}

function encodeRepoV2(repo: TreeStoredSchema): FormatV2 {
	const nodeSchema: Record<string, schemaFormatV2.TreeNodeSchemaDataFormat> =
		Object.create(null);
	const rootFieldSchema = encodeFieldSchema(repo.rootFieldSchema);
	for (const name of [...repo.nodeSchema.keys()].sort()) {
		const schema = repo.nodeSchema.get(name) ?? fail(0xb28 /* missing schema */);
		Object.defineProperty(nodeSchema, name, {
			enumerable: true,
			configurable: true,
			writable: true,
			value: toTreeNodeSchemaDataFormat(schema.encode()),
		});
	}
	return {
		version: schemaFormatV2.version,
		nodes: nodeSchema,
		root: rootFieldSchema,
		persistedData: repo.rootFieldSchema.persistedData,
	};
}

function decode(f: Format): TreeStoredSchema {
	const nodeSchema: Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> = new Map();
	for (const [key, schema] of Object.entries(f.nodes)) {
		nodeSchema.set(brand(key), storedSchemaDecodeDispatcher.dispatch(schema));
	}
	return {
		rootFieldSchema: decodeFieldSchema(f.root),
		nodeSchema,
	};
}

export function makeSchemaCodec(
	options: ICodecOptions,
	writeVersion: number,
): IJsonCodec<TreeStoredSchema> {
	const family = makeSchemaCodecs(options);
	return makeVersionDispatchingCodec(family, { ...options, writeVersion });
}

export function makeSchemaCodecs(options: ICodecOptions): ICodecFamily<TreeStoredSchema> {
	return makeCodecFamily([
		[1, makeV1CodecWithVersion(options, 1)],
		[2, makeV1CodecWithVersion(options, 2)],
	]);
}

/**
 * Creates a codec which performs synchronous monolithic encoding of schema content.
 */
function makeV1CodecWithVersion(
	options: ICodecOptions,
	version: 1 | 2,
): IJsonCodec<TreeStoredSchema> {
	switch (version) {
		case 1:
			return {
				encode: (data: TreeStoredSchema) => encodeRepoV1(data),
				decode: (data: FormatV1) => decode(data),
			};
		case 2:
			return {
				encode: (data: TreeStoredSchema) => encodeRepoV2(data),
				decode: (data: FormatV2) => decode(data),
			};
		default:
			unreachableCase(version);
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "@fluidframework/core-utils/internal";
import {
	type ICodecOptions,
	type IJsonCodec,
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
	toTreeNodeSchemaDataFormat,
} from "../../core/index.js";
import { brand } from "../../util/index.js";

import { Format } from "./formatV1.js";

export function encodeRepo(repo: TreeStoredSchema): Format {
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

/**
 * Creates a codec which performs synchronous monolithic encoding of schema content.
 */
export function makeSchemaCodec(options: ICodecOptions): IJsonCodec<TreeStoredSchema, Format> {
	return makeVersionedValidatedCodec(options, new Set([schemaFormatV1.version]), Format, {
		encode: (data: TreeStoredSchema) => encodeRepo(data),
		decode: (data: Format) => decode(data),
	});
}

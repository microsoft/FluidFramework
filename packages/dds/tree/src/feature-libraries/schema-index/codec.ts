/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodecOptions, IJsonCodec, makeVersionedValidatedCodec } from "../../codec/index.js";
import {
	BrandedTreeNodeSchemaDataFormat,
	TreeNodeSchemaIdentifier,
	TreeNodeStoredSchema,
	TreeStoredSchema,
	decodeFieldSchema,
	encodeFieldSchema,
	schemaFormat,
	storedSchemaDecodeDispatcher,
} from "../../core/index.js";
import { brand, fail, fromErased } from "../../util/index.js";
import { Format } from "./format.js";

export function encodeRepo(repo: TreeStoredSchema): Format {
	const nodeSchema: Record<string, schemaFormat.TreeNodeSchemaDataFormat> = Object.create(null);
	const rootFieldSchema = encodeFieldSchema(repo.rootFieldSchema);
	for (const name of [...repo.nodeSchema.keys()].sort()) {
		const schema = repo.nodeSchema.get(name) ?? fail("missing schema");
		Object.defineProperty(nodeSchema, name, {
			enumerable: true,
			configurable: true,
			writable: true,
			value: fromErased<BrandedTreeNodeSchemaDataFormat>(schema.encode()),
		});
	}
	return {
		version: schemaFormat.version,
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
	return makeVersionedValidatedCodec(options, new Set([schemaFormat.version]), Format, {
		encode: (data: TreeStoredSchema) => encodeRepo(data),
		decode: (data: Format) => decode(data),
	});
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	TreeStoredSchema,
	TreeNodeStoredSchema,
	TreeNodeSchemaIdentifier,
	schemaFormat,
	BrandedTreeNodeSchemaDataFormat,
	decodeFieldSchema,
	encodeFieldSchema,
	storedSchemaDecodeDispatcher,
} from "../../core";
import { brand, compareNamed, fromErased } from "../../util";
import { ICodecOptions, IJsonCodec } from "../../codec";
import { makeVersionedValidatedCodec } from "../versioned";
import { Format, TreeNodeSchemaFormat } from "./format";

export function encodeRepo(repo: TreeStoredSchema): Format {
	const treeNodeSchema: TreeNodeSchemaFormat[] = [];
	const rootFieldSchema = encodeFieldSchema(repo.rootFieldSchema);
	for (const [name, schema] of repo.nodeSchema) {
		treeNodeSchema.push(encodeTree(name, schema));
	}
	treeNodeSchema.sort(compareNamed);
	return {
		version: schemaFormat.version,
		nodeSchema: treeNodeSchema,
		rootFieldSchema,
	};
}

function encodeTree(
	name: TreeNodeSchemaIdentifier,
	schema: TreeNodeStoredSchema,
): TreeNodeSchemaFormat {
	const out: TreeNodeSchemaFormat = {
		name,
		data: fromErased<BrandedTreeNodeSchemaDataFormat>(schema.encode()),
	};
	return out;
}
function decodeTree(schema: TreeNodeSchemaFormat): TreeNodeStoredSchema {
	return storedSchemaDecodeDispatcher.dispatch(schema.data);
}

function decode(f: Format): TreeStoredSchema {
	const nodeSchema: Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> = new Map();
	for (const tree of f.nodeSchema) {
		nodeSchema.set(brand(tree.name), decodeTree(tree));
	}
	return {
		rootFieldSchema: decodeFieldSchema(f.rootFieldSchema),
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

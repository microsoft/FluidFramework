/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	ObjectNodeStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeStoredSchema,
} from "../../core/index.js";
import { SchemaFactoryAlpha, type TreeNodeSchema } from "../../simple-tree/index.js";
import { brand } from "../../util/index.js";

/**
 * Gets a stored object schema and verifies its presence and node kind.
 *
 * @param schema - The stored schema collection to inspect.
 * @param identifier - The identifier of the expected object node schema.
 * @returns The matching stored object schema.
 */
export function getObjectNodeSchema(
	schema: TreeStoredSchema,
	identifier: string,
): ObjectNodeStoredSchema {
	const node = schema.nodeSchema.get(brand(identifier)) ?? assert.fail();
	assert(node instanceof ObjectNodeStoredSchema);
	return node;
}

/**
 * Creates a set of stored node identifiers for schema assertions.
 *
 * @param identifiers - The node identifiers to include.
 * @returns A set containing the supplied identifiers.
 */
export function typeSet(...identifiers: string[]): Set<TreeNodeSchemaIdentifier> {
	return new Set(identifiers.map((identifier) => brand<TreeNodeSchemaIdentifier>(identifier)));
}

/**
 * Creates fresh schema identities from adjacency lists, with lazy references supporting forward edges and cycles.
 * `edges[i]` lists the indices of schemas referenced by returned schema `i`.
 */
export function createSchemaGraph(edges: readonly (readonly number[])[]): TreeNodeSchema[] {
	const sf = new SchemaFactoryAlpha("components");
	const nodes: TreeNodeSchema[] = [];
	for (const [index, children] of edges.entries()) {
		nodes.push(
			class extends sf.objectRecursive(`N${index}`, {
				child: sf.optionalRecursive(
					children.map((child) => () => nodes[child] ?? assert.fail()),
				),
			}) {},
		);
	}
	return nodes;
}

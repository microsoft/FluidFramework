/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { SchemaFactoryAlpha, type TreeNodeSchema } from "../../simple-tree/index.js";

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

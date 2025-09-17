/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob, unreachableCase } from "@fluidframework/core-utils/internal";
import type {
	TreeNodeSchema,
	TreeArrayNode,
	TreeFieldFromImplicitField,
	TreeMapNode,
} from "@fluidframework/tree";
import { TreeNode } from "@fluidframework/tree";
import { Tree, NodeKind } from "@fluidframework/tree/internal";

/**
 * Given a tree, generates a set of LLM-friendly, unique IDs for each node in the tree.
 */
export class IdGenerator {
	private readonly idCountMap = new Map<string, number>();
	private readonly prefixMap = new Map<string, string>();
	private readonly nodeToIdMap = new WeakMap<TreeNode, string>();
	private readonly ids = new Set<string>();

	public getId(node: TreeNode): string | undefined {
		return this.nodeToIdMap.get(node);
	}

	// Assigns IDs to all node types except arrays and primitives
	public assignIds<T extends TreeFieldFromImplicitField>(node: T): T {
		if (node instanceof TreeNode) {
			const schema = Tree.schema(node);
			switch (schema.kind) {
				case NodeKind.Array: {
					for (const element of node as unknown as TreeArrayNode) {
						this.assignIds(element);
					}
					break;
				}
				case NodeKind.Map: {
					this.getOrCreateId(node);
					for (const value of (node as TreeMapNode).values()) {
						this.assignIds(value);
					}
					break;
				}
				case NodeKind.Object:
				case NodeKind.Record: {
					this.getOrCreateId(node);
					for (const value of Object.values(node)) {
						this.assignIds(value);
					}
					break;
				}
				case NodeKind.Leaf: {
					break;
				}
				default: {
					return unreachableCase(schema.kind, "Unexpected node kind");
				}
			}
		}
		return node;
	}

	private getOrCreateId(node: TreeNode): string {
		const existingID = this.nodeToIdMap.get(node);
		if (existingID !== undefined) {
			return existingID;
		}

		const id = this.generateID(Tree.schema(node));
		this.nodeToIdMap.set(node, id);
		this.ids.add(id);
		return id;
	}

	private generateID(schema: TreeNodeSchema): string {
		const segments = schema.identifier.split(".");

		// If there's no period, the schema itself is the last segment
		const lastSegment = segments[segments.length - 1] ?? oob();
		const prefix = segments.length > 1 ? segments.slice(0, -1).join(".") : "";

		// Check if the last segment already exists with a different prefix
		assert(
			!this.prefixMap.has(lastSegment) || this.prefixMap.get(lastSegment) === prefix,
			0xc1d /* Different scopes not supported yet. */,
		);

		this.prefixMap.set(lastSegment, prefix);
		const count = this.idCountMap.get(lastSegment) ?? 0;

		let c = count + 1;
		let newId = `${lastSegment}${c}`;
		// We need this logic so that if the LLM already created this ID, we generate a different one instead
		while (this.ids.has(newId)) {
			newId = `${lastSegment}${++c}`;
		}
		this.idCountMap.set(lastSegment, c);
		return newId;
	}
}

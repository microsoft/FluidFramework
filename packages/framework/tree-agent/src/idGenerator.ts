/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";
import type {
	TreeNodeSchema,
	TreeNode,
	TreeArrayNode,
	TreeFieldFromImplicitField,
} from "@fluidframework/tree";
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

	public assignIds<T extends TreeFieldFromImplicitField>(node: T): T {
		if (typeof node === "object" && node !== null) {
			const schema = Tree.schema(node as unknown as TreeNode);
			if (schema.kind === NodeKind.Array) {
				for (const element of node as unknown as TreeArrayNode) {
					this.assignIds(element);
				}
			} else {
				// TODO: SharedTree Team needs to either publish TreeNode as a class to use .instanceof() or a typeguard.
				// Uncomment this assertion back once we have a typeguard ready.
				// assert(isTreeNode(node), "Non-TreeNode value in tree.");
				this.getOrCreateId(node as TreeNode);
				for (const key of Object.keys(node)) {
					// biome-ignore lint/suspicious/noExplicitAny: Any
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					this.assignIds((node as Record<string, any>)[key]);
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
			0xa7a /* Different scopes not supported yet. */,
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

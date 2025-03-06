/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";
import { Tree, NodeKind } from "@fluidframework/tree/internal";
import type {
	TreeNode,
	ImplicitFieldSchema,
	TreeArrayNode,
	TreeFieldFromImplicitField,
} from "@fluidframework/tree/internal";

/**
 * Given a tree, generates a set of LLM-friendly, unique IDs for each node in the tree.
 * @remarks The ability to uniquely and stably in the tree is important for the LLM and this library to create and distinguish between different types certain {@link TreeEdit}s.
 */
export class IdGenerator {
	private readonly idCountMap = new Map<string, number>();
	private readonly prefixMap = new Map<string, string>();
	private readonly nodeToIdMap = new Map<TreeNode, string>();
	private readonly idToNodeMap = new Map<string, TreeNode>();

	public constructor() {}

	public getOrCreateId(node: TreeNode, newId?: string): string {
		const existingID = this.nodeToIdMap.get(node);
		if (existingID !== undefined) {
			return existingID;
		}
		if (newId !== undefined) {
			assert(!this.idToNodeMap.has(newId), "ID already exists");
		}

		const schema = Tree.schema(node).identifier;
		const id = newId ?? this.generateID(schema);
		this.nodeToIdMap.set(node, id);
		this.idToNodeMap.set(id, node);

		return id;
	}

	public getNode(id: string): TreeNode | undefined {
		return this.idToNodeMap.get(id);
	}

	public getId(node: TreeNode): string | undefined {
		return this.nodeToIdMap.get(node);
	}

	public assignIds(node: TreeFieldFromImplicitField<ImplicitFieldSchema>): string | undefined {
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
				const objId = this.getOrCreateId(node as TreeNode);
				for (const key of Object.keys(node)) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
					this.assignIds((node as unknown as any)[key]);
				}
				return objId;
			}
		}
		return undefined;
	}

	private generateID(schema: string): string {
		const segments = schema.split(".");

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
		while (this.idToNodeMap.has(newId)) {
			newId = `${lastSegment}${++c}`;
		}
		this.idCountMap.set(lastSegment, c);
		return newId;
	}
}

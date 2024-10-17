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

import { isTreeNode } from "./utils.js";

/**
 * Given a tree node, generates a set of LLM friendly, unique ids for each node in a given Shared Tree.
 * @remarks - simple id's are important for the LLM and this library to create and distinguish between different types certain TreeEdits
 */
export class IdGenerator {
	private readonly idCountMap = new Map<string, number>();
	private readonly prefixMap = new Map<string, string>();
	private readonly nodeToIdMap = new Map<TreeNode, string>();
	private readonly idToNodeMap = new Map<string, TreeNode>();

	public constructor() {}

	public getOrCreateId(node: TreeNode): string {
		const existingID = this.nodeToIdMap.get(node);
		if (existingID !== undefined) {
			return existingID;
		}

		const schema = Tree.schema(node).identifier;
		const id = this.generateID(schema);
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
				(node as unknown as TreeArrayNode).forEach((element) => {
					this.assignIds(element);
				});
			} else {
				assert(isTreeNode(node), "Non-TreeNode value in tree.");
				const objId = this.getOrCreateId(node);
				Object.keys(node).forEach((key) => {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
					this.assignIds((node as unknown as any)[key]);
				});
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
			"Different scopes not supported yet.",
		);

		this.prefixMap.set(lastSegment, prefix);
		const count = this.idCountMap.get(lastSegment) ?? 1;
		this.idCountMap.set(lastSegment, count + 1);

		return `${lastSegment}${count}`;
	}
}

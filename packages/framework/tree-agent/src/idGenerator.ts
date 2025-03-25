/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { Tree, NodeKind } from "@fluidframework/tree/internal";
import type {
	TreeNode,
	TreeArrayNode,
	TreeFieldFromImplicitField,
} from "@fluidframework/tree/internal";

import { failUsage } from "./utils.js";

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
		if (newId !== undefined && this.idToNodeMap.has(newId)) {
			throw new UsageError(`ID already exists: ${newId}. Do not reuse IDs.`);
		}

		const schema = Tree.schema(node).identifier;
		const id = newId ?? this.generateID(schema);
		this.nodeToIdMap.set(node, id);
		this.idToNodeMap.set(id, node);

		return id;
	}

	public get(id: string): TreeNode {
		return (
			this.getNode(id) ??
			failUsage(
				`No node found with ID ${id}. Either the node doesn't exist or it has been removed from the tree.`,
			)
		);
	}

	public getNode(id: string): TreeNode | undefined {
		return this.idToNodeMap.get(id);
	}

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
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
					this.assignIds((node as unknown as any)[key]);
				}
			}
		}
		return node;
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

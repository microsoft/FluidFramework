/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";
import { Tree } from "../shared-tree/index.js";
import {
	NodeKind,
	type ImplicitFieldSchema,
	type TreeArrayNode,
	type TreeFieldFromImplicitField,
} from "../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { TreeNode } from "../simple-tree/core/index.js";

export class IdGenerator {
	private readonly idCountMap: Map<string, number> = new Map();
	private readonly prefixMap: Map<string, string> = new Map();
	private readonly nodeToIdMap: Map<TreeNode, string> = new Map();
	private readonly idToNodeMap: Map<string, TreeNode> = new Map();

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
				assert(node instanceof TreeNode, "Non-TreeNode value in tree.");
				const objId = this.getOrCreateId(node);
				Object.keys(node).forEach((key) => {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
		const count = this.idCountMap.get(lastSegment) ?? 0;
		this.idCountMap.set(lastSegment, count + 1);

		return `${lastSegment}${count}`;
	}
}

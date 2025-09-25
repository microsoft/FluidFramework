/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { TreeNode, Tree, NodeKind } from "@fluidframework/tree";
import type {
	ImplicitFieldSchema,
	TreeFieldFromImplicitField,
	TreeMapNode,
	TreeArrayNode,
	TreeNodeSchema,
} from "@fluidframework/tree";
import { TreeAlpha } from "@fluidframework/tree/alpha";
import type {
	UnsafeUnknownSchema,
	ReadableField,
	TreeBranch,
	TreeRecordNode,
	ReadSchema,
} from "@fluidframework/tree/alpha";

import { getNodeOnBranch } from "./getNodeOnBranch.js";
import type { TreeView } from "./utils.js";

/**
 * Wraps either a {@link TreeView} or a {@link TreeNode} and provides a common interface over them.
 */
export class Subtree<TRoot extends ImplicitFieldSchema | UnsafeUnknownSchema> {
	public constructor(
		private readonly viewOrNode: TreeView<TRoot> | (ReadableField<TRoot> & TreeNode),
	) {
		if (viewOrNode instanceof TreeNode && TreeAlpha.branch(viewOrNode) === undefined) {
			throw new UsageError("The provided node must belong to a branch.");
		}
	}

	public get branch(): TreeBranch {
		return this.viewOrNode instanceof TreeNode
			? (TreeAlpha.branch(this.viewOrNode) ?? fail("Node cannot be raw."))
			: this.viewOrNode;
	}

	public get field(): ReadableField<TRoot> {
		return this.viewOrNode instanceof TreeNode ? this.viewOrNode : this.viewOrNode.root;
	}

	public set field(value: TreeFieldFromImplicitField<ReadSchema<TRoot>>) {
		if (this.viewOrNode instanceof TreeNode) {
			const parent = Tree.parent(this.viewOrNode);
			if (parent === undefined) {
				// In general, this is not a correct cast, but we know that the root of the branch at least allows the type of `value`
				const view = this.branch as TreeView<TRoot>;
				view.root = value;
			} else {
				const schema = Tree.schema(parent);
				switch (schema.kind) {
					case NodeKind.Object: {
						const key = Tree.key(this.viewOrNode) as string;
						(parent as unknown as Record<string, unknown>)[key] = value;
						break;
					}
					case NodeKind.Record: {
						const key = Tree.key(this.viewOrNode) as string;
						if (value === undefined) {
							// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
							delete (parent as TreeRecordNode)[key];
						} else {
							(parent as TreeRecordNode)[key] = value;
						}
						break;
					}
					case NodeKind.Map: {
						const key = Tree.key(this.viewOrNode) as string;
						if (value === undefined) {
							(parent as TreeMapNode).delete(key);
						} else {
							(parent as TreeMapNode).set(key, value as never);
						}
						break;
					}
					case NodeKind.Array: {
						const index = Tree.key(this.viewOrNode) as number;
						const arrayNode = parent as TreeArrayNode;
						if (value === undefined) {
							arrayNode.removeAt(index);
						} else {
							this.branch.runTransaction(() => {
								arrayNode.removeAt(index);
								arrayNode.insertAt(index, value as never);
							});
						}
					}
					default: {
						fail("Unexpected node kind");
					}
				}
			}
		} else {
			this.viewOrNode.root = value;
		}
	}

	public get schema(): TreeNodeSchema | ReadSchema<TRoot> {
		return this.viewOrNode instanceof TreeNode
			? Tree.schema(this.viewOrNode)
			: this.viewOrNode.schema;
	}

	public fork(): Subtree<TRoot> {
		if (this.viewOrNode instanceof TreeNode) {
			const branch = TreeAlpha.branch(this.viewOrNode) ?? fail("Node cannot be raw.");
			const node =
				getNodeOnBranch(this.viewOrNode, branch.fork()) ??
				fail("Expected node to be on new fork.");

			return new Subtree<TRoot>(node);
		} else {
			return new Subtree<TRoot>(this.viewOrNode.fork());
		}
	}
}

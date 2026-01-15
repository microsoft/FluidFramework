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
} from "@fluidframework/tree";
import { TreeAlpha } from "@fluidframework/tree/alpha";
import type {
	ReadableField,
	TreeRecordNode,
	TreeBranchAlpha,
} from "@fluidframework/tree/alpha";

import type { TreeView, ViewOrTree } from "./api.js";
import { getNodeOnBranch } from "./getNodeOnBranch.js";

/**
 * Wraps either a {@link TreeView} or a {@link TreeNode} and provides a common interface over them.
 */
export class Subtree<TRoot extends ImplicitFieldSchema> {
	public constructor(public readonly viewOrTree: ViewOrTree<TRoot>) {
		if (viewOrTree instanceof TreeNode && TreeAlpha.branch(viewOrTree) === undefined) {
			throw new UsageError("The provided node must belong to a branch.");
		}
	}

	public get branch(): TreeBranchAlpha {
		return this.viewOrTree instanceof TreeNode
			? (TreeAlpha.branch(this.viewOrTree) ?? fail(0xcb3 /* Node cannot be raw. */))
			: this.viewOrTree;
	}

	public get field(): ReadableField<TRoot> {
		return this.viewOrTree instanceof TreeNode ? this.viewOrTree : this.viewOrTree.root;
	}

	public set field(value: TreeFieldFromImplicitField<TRoot>) {
		if (this.viewOrTree instanceof TreeNode) {
			const parent = Tree.parent(this.viewOrTree);
			if (parent === undefined) {
				// In general, this is not a correct cast, but we know that the root of the branch at least allows the type of `value`
				const view = this.branch as TreeView<TRoot>;
				view.root = value;
			} else {
				const schema = Tree.schema(parent);
				switch (schema.kind) {
					case NodeKind.Object: {
						const key = Tree.key(this.viewOrTree) as string;
						(parent as unknown as Record<string, unknown>)[key] = value;
						break;
					}
					case NodeKind.Record: {
						const key = Tree.key(this.viewOrTree) as string;
						if (value === undefined) {
							// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
							delete (parent as TreeRecordNode)[key];
						} else {
							(parent as TreeRecordNode)[key] = value;
						}
						break;
					}
					case NodeKind.Map: {
						const key = Tree.key(this.viewOrTree) as string;
						if (value === undefined) {
							(parent as TreeMapNode).delete(key);
						} else {
							(parent as TreeMapNode).set(key, value as never);
						}
						break;
					}
					case NodeKind.Array: {
						const index = Tree.key(this.viewOrTree) as number;
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
						fail(0xcb4 /* Unexpected node kind */);
					}
				}
			}
		} else {
			this.viewOrTree.root = value;
		}
	}

	public get schema(): TRoot {
		return (
			this.viewOrTree instanceof TreeNode
				? Tree.schema(this.viewOrTree)
				: this.viewOrTree.schema
		) as TRoot;
	}

	public fork(): Subtree<TRoot> {
		if (this.viewOrTree instanceof TreeNode) {
			const branch =
				TreeAlpha.branch(this.viewOrTree) ?? fail(0xcb5 /* Node cannot be raw. */);
			const node =
				getNodeOnBranch(this.viewOrTree, branch.fork()) ??
				fail(0xcb6 /* Expected node to be on new fork. */);

			return new Subtree<TRoot>(node);
		} else {
			return new Subtree<TRoot>(this.viewOrTree.fork());
		}
	}
}

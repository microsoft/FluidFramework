/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Definition, NodeId } from './Identifiers';
import { ChangeNode, Payload, TraitMap, TreeNode } from './generic';
import { TreeView } from './TreeView';
import { memoizeGetter } from './Common';
import { getChangeNodeFromView } from './TreeViewUtilities';

/**
 * A handle to a `TreeNode` that exists within a specific `TreeView`. This type provides a convenient
 * API for traversing trees of nodes in a TreeView and is not designed to provide maximum runtime
 * performance; if performance is a concern, consider using the TreeView and TreeViewNode APIs directly.
 * @public
 */
export class TreeNodeHandle implements TreeNode<TreeNodeHandle> {
	private readonly view: TreeView;
	private readonly nodeId: NodeId;

	/** Construct a handle which references the node with the given id in the given `TreeView` */
	public constructor(view: TreeView, nodeId: NodeId) {
		this.view = view;
		this.nodeId = nodeId;
	}

	public get payload(): Payload | undefined {
		// This is necessary, because Payload aliases any
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return this.node.payload;
	}

	public get definition(): Definition {
		return this.node.definition;
	}

	public get identifier(): NodeId {
		return this.node.identifier;
	}

	public get traits(): TraitMap<TreeNodeHandle> {
		// Construct a new trait map that wraps each node in each trait in a handle
		const traitMap: TraitMap<TreeNodeHandle> = {};
		const { view } = this;
		for (const [label, trait] of Object.entries(this.node.traits)) {
			Object.defineProperty(traitMap, label, {
				get() {
					const handleTrait = trait.map((node) => new TreeNodeHandle(view, node.identifier));
					return memoizeGetter(this as TraitMap<TreeNodeHandle>, label, handleTrait);
				},
				configurable: true,
				enumerable: true,
			});
		}

		return memoizeGetter(this, 'traits', traitMap);
	}

	/**
	 * Get a `ChangeNode` for the tree view node that this handle references
	 */
	public get node(): ChangeNode {
		return memoizeGetter(this, 'node', getChangeNodeFromView(this.view, this.nodeId, true));
	}

	/**
	 * Generate a new `ChangeNode` for the tree view node that this handle references. The returned node will be fully
	 * demanded, i.e. will contain no lazy/virtualized subtrees.
	 */
	public demandTree(): ChangeNode {
		return getChangeNodeFromView(this.view, this.nodeId, false);
	}

	public toString(): string {
		return JSON.stringify(this.demandTree());
	}
}

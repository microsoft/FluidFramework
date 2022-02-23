/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Definition, NodeId } from './Identifiers';
import { Payload, TraitMap, TreeNode, TreeView, TreeViewNode } from './generic';
import { fail, memoizeGetter } from './Common';

/**
 * A handle to a `TreeNode` that exists within a specific `TreeView`. This type provides a convenient
 * API for traversing trees of nodes in a TreeView and is not designed to provide maximum runtime
 * performance; if performance is a concern, consider using the TreeView and TreeViewNode APIs directly.
 * @public
 */
export class TreeNodeHandle implements TreeNode<TreeNodeHandle> {
	private readonly view: TreeView;
	private readonly viewNode: TreeViewNode;

	/** Construct a handle which references the node with the given id in the given `TreeView` */
	public constructor(view: TreeView, nodeId: NodeId) {
		this.view = view;
		this.viewNode = view.tryGetViewNode(nodeId) ?? fail('Failed to create handle: node is not present in view');
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
		for (const [label, trait] of this.node.traits.entries()) {
			Object.defineProperty(traitMap, label, {
				get() {
					const handleTrait = trait.map((node) => new TreeNodeHandle(view, node));
					return memoizeGetter(this as TraitMap<TreeNodeHandle>, label, handleTrait);
				},
				configurable: true,
				enumerable: true,
			});
		}

		return memoizeGetter(this, 'traits', traitMap);
	}

	/**
	 * Get a `TreeViewNode` for the tree view node that this handle references
	 */
	public get node(): TreeViewNode {
		return memoizeGetter(this, 'node', this.viewNode);
	}
}

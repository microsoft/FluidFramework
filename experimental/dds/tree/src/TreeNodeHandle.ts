/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Definition, NodeId } from './Identifiers';
import { Payload, TraitMap, TreeNode, TreeNodeSequence } from './PersistedTypes';
import { Snapshot } from './Snapshot';
import { memoizeGetter } from './Common';
import { getTreeNodeFromSnapshotNode } from './SnapshotUtilities';

/**
 * A handle to a `TreeNode` that exists within a specific `Snapshot`. This type provides a convenient
 * API for traversing trees of nodes in a Snapshot and is not designed to provide maximum runtime
 * performance; if performance is a concern, consider using the Snapshot and SnapshotNode APIs directly.
 * @public
 */
export class TreeNodeHandle implements TreeNode<TreeNodeHandle> {
	private readonly snapshot: Snapshot;
	private readonly nodeId: NodeId;

	/** Construct a handle which references the node with the given id in the given `Snapshot` */
	public constructor(snapshot: Snapshot, nodeId: NodeId) {
		this.snapshot = snapshot;
		this.nodeId = nodeId;
	}

	public get payload(): Payload | undefined {
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
		const { snapshot } = this;
		for (const [label, trait] of Object.entries(this.node.traits)) {
			Object.defineProperty(traitMap, label, {
				get() {
					const handleTrait = trait.map((node) => new TreeNodeHandle(snapshot, node.identifier));
					return memoizeGetter(
						this as TraitMap<TreeNodeHandle>,
						label,
						(handleTrait as unknown) as TreeNodeSequence<TreeNodeHandle>
					);
				},
				configurable: true,
				enumerable: true,
			});
		}

		return memoizeGetter(this, 'traits', traitMap);
	}

	public get node(): TreeNode<TreeNodeHandle> {
		return memoizeGetter(this, 'node', getTreeNodeFromSnapshotNode(this.snapshot, this.nodeId, true));
	}
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { memoizeGetter } from './Common';
import { NodeId, TraitLabel } from './Identifiers';
import { ChangeNode, TraitMap } from './PersistedTypes';
import { Snapshot, SnapshotNode } from './Snapshot';

/** Returns true if two `SnapshotNodes` are equivalent */
export function compareSnapshotNodes(nodeA: SnapshotNode, nodeB: SnapshotNode): boolean {
	if (nodeA === nodeB) {
		return true;
	}

	if (nodeA.identifier !== nodeB.identifier) {
		return false;
	}

	if (nodeA.definition !== nodeB.definition) {
		return false;
	}

	if (nodeA.payload?.base64 !== nodeB.payload?.base64) {
		return false;
	}

	if (nodeA.traits.size !== nodeB.traits.size) {
		return false;
	}

	for (const traitA of nodeA.traits) {
		const [traitLabelA, nodeSequenceA] = traitA;
		const nodeSequenceB = nodeB.traits.get(traitLabelA);
		if (!nodeSequenceB) {
			return false;
		}

		if (nodeSequenceA.length !== nodeSequenceB.length) {
			return false;
		}

		for (let i = 0; i < nodeSequenceA.length; i++) {
			if (nodeSequenceA[i] !== nodeSequenceB[i]) {
				return false;
			}
		}
	}

	return true;
}

/**
 * Converts a node in a snapshot to an equivalent `ChangeNode`.
 * @param snapshot - the snapshot in which the node exists
 * @param nodeId - the id of the node in the snapshot
 * @param lazyTraits - whether or not traits should be populated lazily.
 * If lazy, the subtrees under each trait will not be read until the trait is first accessed.
 */
export function getChangeNodeFromSnapshot(snapshot: Snapshot, nodeId: NodeId, lazyTraits = false): ChangeNode {
	const node = snapshot.getSnapshotNode(nodeId);
	const nodeData = {
		definition: node.definition,
		identifier: node.identifier,
		...(node.payload ? { payload: node.payload } : {}),
	};

	if (lazyTraits) {
		return {
			...nodeData,
			get traits() {
				return memoizeGetter(this, 'traits', makeTraits(snapshot, node.traits, lazyTraits));
			},
		};
	}

	return {
		...nodeData,
		traits: makeTraits(snapshot, node.traits, lazyTraits),
	};
}

/** Given the traits of a SnapshotNode, return the corresponding traits on a Node */
function makeTraits(
	snapshot: Snapshot,
	traits: ReadonlyMap<TraitLabel, readonly NodeId[]>,
	lazyTraits = false
): TraitMap<ChangeNode> {
	const traitMap = {};
	for (const [label, trait] of traits.entries()) {
		if (lazyTraits) {
			Object.defineProperty(traitMap, label, {
				get() {
					const treeNodeTrait = trait.map((nodeId) =>
						getChangeNodeFromSnapshot(snapshot, nodeId, lazyTraits)
					);
					return memoizeGetter(this as TraitMap<ChangeNode>, label, treeNodeTrait);
				},
				configurable: true,
				enumerable: true,
			});
		} else {
			Object.defineProperty(traitMap, label, {
				value: trait.map((nodeId) => getChangeNodeFromSnapshot(snapshot, nodeId, lazyTraits)),
				enumerable: true,
			});
		}
	}

	return traitMap;
}

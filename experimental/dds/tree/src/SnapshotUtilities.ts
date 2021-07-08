/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { copyPropertyIfDefined, memoizeGetter } from './Common';
import { NodeId, TraitLabel } from './Identifiers';
import { ChangeNode, TraitMap } from './generic';
import { Snapshot } from './Snapshot';

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
	};
	copyPropertyIfDefined(node, nodeData, 'payload');

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

/**
 * Compares finite numbers to form a strict partial ordering.
 *
 * Handles +/-0 like Map: -0 is equal to +0.
 *
 * Once https://github.com/qwertie/btree-typescript/pull/15 is merged, we can use the version of this function from it.
 */
export function compareFiniteNumbers(a: number, b: number): number {
	return a - b;
}

/**
 * Compares strings lexically to form a strict partial ordering.
 * Once https://github.com/qwertie/btree-typescript/pull/15 is merged, we can use the version of this function from it.
 */
export function compareStrings(a: string, b: string): number {
	return a > b ? 1 : a === b ? 0 : -1;
}

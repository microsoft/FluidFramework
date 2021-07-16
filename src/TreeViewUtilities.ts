/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { copyPropertyIfDefined, memoizeGetter } from './Common';
import { NodeId, TraitLabel } from './Identifiers';
import { ChangeNode, TraitMap } from './generic';
import { TreeView } from './TreeView';

/**
 * Converts a node in a tree view to an equivalent `ChangeNode`.
 * @param view - the view in which the node exists
 * @param nodeId - the id of the node in the view
 * @param lazyTraits - whether or not traits should be populated lazily.
 * If lazy, the subtrees under each trait will not be read until the trait is first accessed.
 */
export function getChangeNodeFromView(view: TreeView, nodeId: NodeId, lazyTraits = false): ChangeNode {
	const node = view.getViewNode(nodeId);
	const nodeData = {
		definition: node.definition,
		identifier: node.identifier,
	};
	copyPropertyIfDefined(node, nodeData, 'payload');

	if (lazyTraits) {
		return {
			...nodeData,
			get traits() {
				return memoizeGetter(this, 'traits', makeTraits(view, node.traits, lazyTraits));
			},
		};
	}

	return {
		...nodeData,
		traits: makeTraits(view, node.traits, lazyTraits),
	};
}

/** Given the traits of a TreeViewNode, return the corresponding traits on a Node */
function makeTraits(
	view: TreeView,
	traits: ReadonlyMap<TraitLabel, readonly NodeId[]>,
	lazyTraits = false
): TraitMap<ChangeNode> {
	const traitMap = {};
	for (const [label, trait] of traits.entries()) {
		if (lazyTraits) {
			Object.defineProperty(traitMap, label, {
				get() {
					const treeNodeTrait = trait.map((nodeId) => getChangeNodeFromView(view, nodeId, lazyTraits));
					return memoizeGetter(this as TraitMap<ChangeNode>, label, treeNodeTrait);
				},
				configurable: true,
				enumerable: true,
			});
		} else {
			Object.defineProperty(traitMap, label, {
				value: trait.map((nodeId) => getChangeNodeFromView(view, nodeId, lazyTraits)),
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

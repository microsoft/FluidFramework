/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { copyPropertyIfDefined, memoizeGetter } from './Common';
import { NodeId, TraitLabel } from './Identifiers';
import { NodeIdConverter } from './NodeIdUtilities';
import { ChangeNode, ChangeNode_0_0_2, TraitMap } from './persisted-types';
import { TreeView } from './TreeView';

/**
 * Converts this tree view to an equivalent `ChangeNode`.
 * @param view - the view to convert
 */
export function getChangeNodeFromView(view: TreeView): ChangeNode {
	return getChangeNodeFromViewNode(view, view.root);
}

/**
 * Converts a node in this tree view to an equivalent `ChangeNode`.
 * @param view - the view of the tree that contains the node to convert
 * @param id - the id of the node to convert
 * @param lazyTraits - whether or not traits should be populated lazily. If true, the subtrees under each trait will not be read until
 * the trait is first accessed.
 */
export function getChangeNodeFromViewNode(view: TreeView, id: NodeId, lazyTraits = false): ChangeNode {
	const node = view.getViewNode(id);
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
					const treeNodeTrait = trait.map((id) => getChangeNodeFromViewNode(view, id, lazyTraits));
					return memoizeGetter(this as TraitMap<ChangeNode>, label, treeNodeTrait);
				},
				configurable: true,
				enumerable: true,
			});
		} else {
			Object.defineProperty(traitMap, label, {
				value: trait.map((id) => getChangeNodeFromViewNode(view, id, lazyTraits)),
				enumerable: true,
			});
		}
	}

	return traitMap;
}

/**
 * Converts this tree view to an equivalent `ChangeNode`.
 * @param view - the view to convert
 */
export function getChangeNode_0_0_2FromView(view: TreeView, idConverter: NodeIdConverter): ChangeNode_0_0_2 {
	return getChangeNode_0_0_2FromViewNode(view, view.root, idConverter);
}

/**
 * Converts a node in this tree view to an equivalent `ChangeNode`.
 * @param view - the view of the tree that contains the node to convert
 * @param id - the id of the node to convert
 * @param lazyTraits - whether or not traits should be populated lazily. If true, the subtrees under each trait will not be read until
 * the trait is first accessed.
 * @deprecated Remove by March 2022
 */
export function getChangeNode_0_0_2FromViewNode(
	view: TreeView,
	id: NodeId,
	idConverter: NodeIdConverter
): ChangeNode_0_0_2 {
	const node = view.getViewNode(id);
	const nodeData = {
		definition: node.definition,
		identifier: idConverter.convertToStableNodeId(node.identifier),
	};
	copyPropertyIfDefined(node, nodeData, 'payload');

	return {
		...nodeData,
		traits: makeTraits_0_0_2(view, node.traits, idConverter),
	};
}

/**
 * Given the traits of a TreeViewNode, return the corresponding traits on a Node
 * @deprecated Remove by march 2022
 */
function makeTraits_0_0_2(
	view: TreeView,
	traits: ReadonlyMap<TraitLabel, readonly NodeId[]>,
	idConverter: NodeIdConverter
): TraitMap<ChangeNode_0_0_2> {
	const traitMap = {};
	for (const [label, trait] of traits.entries()) {
		Object.defineProperty(traitMap, label, {
			value: trait.map((id) => getChangeNode_0_0_2FromViewNode(view, id, idConverter)),
			enumerable: true,
		});
	}

	return traitMap;
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuidv4 } from 'uuid';
import { copyPropertyIfDefined, fail, Mutable } from '../Common';
import { StablePlace, StableRange } from '../default-edits';
import { EditId, TraitLabel } from '../Identifiers';
import { Edit, NodeData, PlaceholderTree, StableTraitLocation, TraitMap, TreeNode } from './PersistedTypes';

/**
 * Functions for constructing and comparing Edits.
 */

/**
 * Returns true if the provided Edits have equivalent properties.
 */
export function compareEdits(editIdA: EditId, editIdB: EditId): boolean {
	// TODO #45414: We should also be deep comparing the list of changes in the edit. This is not straightforward.
	// We can use our edit validation code when we write it since it will need to do deep walks of the changes.
	return editIdA === editIdB;
}

/**
 * Check if two TraitLocations are equal.
 */
export function compareTraits(traitA: StableTraitLocation, traitB: StableTraitLocation): boolean {
	if (traitA.label !== traitB.label || traitA.parent !== traitB.parent) {
		return false;
	}

	return true;
}

/**
 * Generates a new edit object from the supplied changes.
 */
export function newEdit<TEdit>(changes: readonly TEdit[]): Edit<TEdit> {
	return { id: newEditId(), changes };
}

/**
 * Generates a new edit object from the supplied changes.
 */
export function newEditId(): EditId {
	return uuidv4() as EditId;
}

/**
 * Deeply clone the given StablePlace
 */
export function deepCloneStablePlace(place: StablePlace): StablePlace {
	const clone: StablePlace = { side: place.side };
	copyPropertyIfDefined(place, clone, 'referenceSibling');
	copyPropertyIfDefined(place, clone, 'referenceTrait');
	return clone;
}

/**
 * Deeply clone the given StableRange
 */
export function deepCloneStableRange(range: StableRange): StableRange {
	return { start: deepCloneStablePlace(range.start), end: deepCloneStablePlace(range.end) };
}

/**
 * Transform an input tree into an isomorphic output tree with new identifiers on each node
 * @param tree - the input tree
 * @param convert - a conversion function that will run on all nodes not of type TPlaceholder
 * @param isPlaceholder - a predicate which determines if the given node is of type TPlaceholder
 */
export function convertTreeNodes<TPlaceholder>(
	root: PlaceholderTree<TPlaceholder>,
	convert: (node: NodeData) => NodeData,
	isPlaceholder: (node: PlaceholderTree<TPlaceholder>) => node is TPlaceholder
): PlaceholderTree<TPlaceholder> {
	if (isPlaceholder(root)) {
		return root;
	}
	const rootChildIterator = iterateChildren(Object.entries(root.traits))[Symbol.iterator]();
	const convertedRoot = convert(root);
	const newRoot = {
		definition: convertedRoot.definition,
		identifier: convertedRoot.identifier,
		traits: {},
	};
	copyPropertyIfDefined(convertedRoot, newRoot, 'payload');
	const pendingNodes: {
		childIterator: Iterator<[TraitLabel, PlaceholderTree<TPlaceholder>]>;
		newNode: Mutable<TreeNode<PlaceholderTree<TPlaceholder>>>;
	}[] = [{ childIterator: rootChildIterator, newNode: newRoot }];

	while (pendingNodes.length > 0) {
		const { childIterator, newNode } = pendingNodes[pendingNodes.length - 1] ?? fail('Undefined node');
		const { value, done } = childIterator.next();
		if (done === true) {
			pendingNodes.pop();
		} else {
			const [traitLabel, child] = value as [TraitLabel, PlaceholderTree<TPlaceholder>];
			let newChild: Mutable<PlaceholderTree<TPlaceholder>> = child;
			if (!isPlaceholder(newChild)) {
				const childIterator = iterateChildren(Object.entries(newChild.traits))[Symbol.iterator]();
				const convertedChild = convert(newChild);
				newChild = {
					definition: convertedChild.definition,
					identifier: convertedChild.identifier,
					traits: {},
				};
				copyPropertyIfDefined(convertedChild, newChild, 'payload');
				pendingNodes.push({ childIterator, newNode: newChild });
			}
			const newTraits = newNode.traits as Mutable<TraitMap<PlaceholderTree<TPlaceholder>>>;
			let newTrait = newTraits[traitLabel];
			if (newTrait === undefined) {
				newTrait = [];
				newTraits[traitLabel] = newTrait;
			}
			(newTrait as PlaceholderTree<TPlaceholder>[]).push(newChild);
		}
	}

	return newRoot;
}

function* iterateChildren<T>(traits: Iterable<[string, readonly T[]]>): Iterable<[TraitLabel, T]> {
	for (const [label, trait] of traits) {
		for (const child of trait) {
			yield [label as TraitLabel, child];
		}
	}
}

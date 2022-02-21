/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuidv4 } from 'uuid';
import { copyPropertyIfDefined, fail, Mutable } from '../Common';
import { StablePlace, StableRange } from '../default-edits';
import { EditId, TraitLabel } from '../Identifiers';
import { Edit, HasTraits, StableTraitLocation, TraitMap } from './PersistedTypes';

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
 * A node type that does not require its children to be specified
 */
export type NoTraits<TChild extends HasTraits<unknown>> = Omit<TChild, keyof HasTraits<TChild>>;

/**
 * Transform an input tree into an isomorphic output tree
 * @param tree - the input tree
 * @param convert - a conversion function that will run on each node in the input tree to produce the output tree
 */
export function convertTreeNodes<TIn extends HasTraits<TIn>, TOut extends HasTraits<TOut>>(
	root: TIn,
	convert: (node: TIn) => NoTraits<TOut>
): TOut;

/**
 * Transform an input tree into an isomorphic output tree
 * @param tree - the input tree
 * @param convert - a conversion function that will run on each (non-placeholder) node in the input tree to produce the output tree
 * @param isPlaceholder - a predicate which determines if a node is a placeholder
 */
export function convertTreeNodes<
	TIn extends HasTraits<TIn | TPlaceholder>,
	TOut extends HasTraits<TOut | TPlaceholder>,
	TPlaceholder
>(
	root: TIn | TPlaceholder,
	convert: (node: TIn) => NoTraits<TOut>,
	isPlaceholder: (node: TIn | TPlaceholder) => node is TPlaceholder
): TOut | TPlaceholder;

/**
 * Transform an input tree into an isomorphic output tree
 * @param tree - the input tree
 * @param convert - a conversion function that will run on all nodes not of type TPlaceholder
 * @param isPlaceholder - a predicate which determines if the given node is of type TPlaceholder
 */
export function convertTreeNodes<
	TIn extends HasTraits<TIn | TPlaceholder>,
	TOut extends HasTraits<TOut | TPlaceholder>,
	TPlaceholder
>(
	root: TIn | TPlaceholder,
	convert: (node: TIn) => NoTraits<TOut>,
	isPlaceholder?: (node: TIn | TPlaceholder) => node is TPlaceholder
): TOut | TPlaceholder {
	if (isKnownType(root, isPlaceholder)) {
		return root;
	}

	const rootChildIterator = iterateChildren(Object.entries(root.traits))[Symbol.iterator]();
	const convertedRoot = convert(root) as Mutable<TOut>;
	convertedRoot.traits = {};
	const pendingNodes: {
		childIterator: Iterator<[TraitLabel, TIn | TPlaceholder]>;
		newNode: Mutable<TOut>;
	}[] = [{ childIterator: rootChildIterator, newNode: convertedRoot }];

	while (pendingNodes.length > 0) {
		const { childIterator, newNode } = pendingNodes[pendingNodes.length - 1] ?? fail('Undefined node');
		const { value, done } = childIterator.next();
		if (done === true) {
			pendingNodes.pop();
		} else {
			const [traitLabel, child] = value as [TraitLabel, TIn | TPlaceholder];
			let newChild: Mutable<TOut> | TPlaceholder;
			if (!isKnownType(child, isPlaceholder)) {
				newChild = convert(child) as Mutable<TOut>;
				newChild.traits = {};
				pendingNodes.push({
					childIterator: iterateChildren(Object.entries(child.traits))[Symbol.iterator](),
					newNode: newChild,
				});
			} else {
				newChild = child;
			}
			const newTraits = newNode.traits as Mutable<TraitMap<TOut | TPlaceholder>>;
			let newTrait = newTraits[traitLabel];
			if (newTrait === undefined) {
				newTrait = [];
				newTraits[traitLabel] = newTrait;
			}
			(newTrait as (TOut | TPlaceholder)[]).push(newChild);
		}
	}

	return convertedRoot;
}

function* iterateChildren<T>(traits: Iterable<[string, readonly T[]]>): Iterable<[TraitLabel, T]> {
	for (const [label, trait] of traits) {
		for (const child of trait) {
			yield [label as TraitLabel, child];
		}
	}
}

// Useful for collapsing type checks in `convertTreeNodes` into a single line
function isKnownType<T, Type extends T>(value: T, isType?: (value: T) => value is Type): value is Type {
	return isType?.(value) ?? false;
}

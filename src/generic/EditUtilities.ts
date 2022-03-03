/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from '@fluidframework/core-interfaces';
import { v4 as uuidv4 } from 'uuid';
import { compareArrays, fail, Mutable } from '../Common';
import { EditId, TraitLabel } from '../Identifiers';
import { getChangeNode_0_0_2FromView } from '../SerializationUtilities';
import { NodeIdConverter } from './NodeIdUtilities';
import {
	ChangeNode,
	ChangeNode_0_0_2,
	Edit,
	HasTraits,
	NodeData,
	NodeData_0_0_2,
	Payload,
	TraitLocation,
	TraitLocation_0_0_2,
	TraitMap,
} from './PersistedTypes';
import { TreeView } from './TreeView';

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
export function compareTraits(
	traitA: TraitLocation | TraitLocation_0_0_2,
	traitB: TraitLocation | TraitLocation_0_0_2
): boolean {
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
 * @returns true if two `Payloads` are identical.
 * May return false for equivalent payloads encoded differently.
 *
 * Object field order and object identity are not considered significant, and are ignored by this function.
 * (This is because they may not be preserved through roundtrip).
 *
 * For other information which fluid would lose on serialization round trip,
 * behavior is unspecified other than this this function is reflective (all payloads are equal to themselves)
 * and commutative (argument order does not matter).
 *
 * This means that any Payload is equal to itself and a deep clone of itself.
 *
 * Payloads might not be equal to a version of themselves that has been serialized then deserialized.
 * If they are serialized then deserialized again, the two deserialized objects will compare equal,
 * however the serialized strings may be unequal (due to field order for objects being unspecified).
 *
 * Fluid will cause lossy operations due to use of JSON.stringify().
 * This includes:
 * - Loss of object identity
 * - Loss of field order (may be ordered arbitrarily)
 * - -0 becomes +0
 * - NaN, Infinity, -Infinity all become null
 * - custom toJSON functions may cause arbitrary behavior
 * - functions become undefined or null
 * - non enumerable properties (including prototype) are lost
 * - more (this is not a complete list)
 *
 * Inputs must not contain cyclic references other than fields set to their immediate parent (for the JavaScript feature detection pattern).
 *
 * IFluidHandle instances (detected via JavaScript feature detection pattern) are only compared by absolutePath.
 *
 * TODO:#54095: Is there a better way to do this comparison?
 * @public
 */
export function comparePayloads(a: Payload, b: Payload): boolean {
	// === is not reflective because of how NaN is handled, so use Object.is instead.
	// This treats -0 and +0 as different.
	// Since -0 is not preserved in serialization round trips,
	// it can be handed in any way that is reflective and commutative, so this is fine.
	if (Object.is(a, b)) {
		return true;
	}

	// Primitives which are equal would have early returned above, so now if the values are not both objects, they are unequal.
	if (typeof a !== 'object' || typeof b !== 'object') {
		return false;
	}

	// null is of type object, and needs to be treated as distinct from the empty object.
	// Handling it early also avoids type errors trying to access its keys.
	// Rationale: 'undefined' payloads are reserved for future use (see 'SetValue' interface).
	// eslint-disable-next-line no-null/no-null
	if (a === null || b === null) {
		return false;
	}

	// Special case IFluidHandles, comparing them only by their absolutePath
	// Detect them using JavaScript feature detection pattern: they have a `IFluidHandle` field that is set to the parent object.
	{
		const aHandle = a as IFluidHandle;
		const bHandle = b as IFluidHandle;
		if (aHandle.IFluidHandle === a) {
			if (bHandle.IFluidHandle !== b) {
				return false;
			}
			return a.absolutePath === b.absolutePath;
		}
	}

	// Fluid Serialization (like Json) only keeps enumerable properties, so we can ignore non-enumerable ones.
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);

	if (aKeys.length !== bKeys.length) {
		return false;
	}

	// make sure objects with numeric keys (or no keys) compare unequal to arrays.
	if (a instanceof Array !== b instanceof Array) {
		return false;
	}

	// Fluid Serialization (like Json) orders object fields arbitrarily, so reordering fields is not considered considered a change.
	// Therefor the keys arrays must be sorted here.
	if (!(a instanceof Array)) {
		aKeys.sort();
		bKeys.sort();
	}

	// First check keys are equal.
	// This will often early exit, and thus is worth doing as a separate pass than recursive check.
	if (!compareArrays(aKeys, bKeys)) {
		return false;
	}

	for (let i = 0; i < aKeys.length; i++) {
		const aItem: Payload = a[aKeys[i]];
		const bItem: Payload = b[bKeys[i]];

		// The JavaScript feature detection pattern, used for IFluidHandle, uses a field that is set to the parent object.
		// Detect this pattern and special case it to avoid infinite recursion.
		const aSelf = Object.is(aItem, a);
		const bSelf = Object.is(bItem, b);
		if (aSelf !== bSelf) {
			return false;
		}
		if (!aSelf) {
			if (!comparePayloads(aItem, bItem)) {
				return false;
			}
		}
	}

	return true;
}

/**
 * A node type that does not require its children to be specified
 */
export type NoTraits<TChild extends HasTraits<unknown>> = Omit<TChild, keyof HasTraits<TChild>>;

/**
 * Transform an input tree into an isomorphic output tree
 * @param tree - the input tree
 * @param convert - a conversion function that will run on each node in the input tree to produce the output tree.
 */
export function convertTreeNodes<TIn extends HasTraits<TIn>, TOut extends HasTraits<TOut>>(
	root: TIn,
	convert: (node: TIn) => NoTraits<TOut>
): TOut;

/**
 * Transform an input tree into an isomorphic output tree
 * @param tree - the input tree
 * @param convert - a conversion function that will run on each node in the input tree to produce the output tree. Returning undefined
 * means that conversion for the given node was impossible, at which time the entire tree conversion will be aborted and return undefined.
 */
export function convertTreeNodes<TIn extends HasTraits<TIn>, TOut extends HasTraits<TOut>>(
	root: TIn,
	convert: (node: TIn) => NoTraits<TOut> | undefined
): TOut | undefined;

/**
 * Transform an input tree into an isomorphic output tree
 * @param tree - the input tree
 * @param convert - a conversion function that will run on each (non-placeholder) node in the input tree to produce the output tree.
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
 * @param convert - a conversion function that will run on each (non-placeholder) node in the input tree to produce the output tree.
 * Returning undefined means that conversion for the given node was impossible, at which time the entire tree conversion will be aborted
 * and return undefined.
 * @param isPlaceholder - a predicate which determines if a node is a placeholder
 */
export function convertTreeNodes<
	TIn extends HasTraits<TIn | TPlaceholder>,
	TOut extends HasTraits<TOut | TPlaceholder>,
	TPlaceholder
>(
	root: TIn | TPlaceholder,
	convert: (node: TIn) => NoTraits<TOut> | undefined,
	isPlaceholder: (node: TIn | TPlaceholder) => node is TPlaceholder
): TOut | TPlaceholder | undefined;

/**
 * Transform an input tree into an isomorphic output tree
 * @param tree - the input tree
 * @param convert - a conversion function that will run on each (non-placeholder) node in the input tree to produce the output tree.
 * Returning undefined means that conversion for the given node was impossible, at which time the entire tree conversion will be aborted
 * and return undefined.
 * @param isPlaceholder - a predicate which determines if the given node is of type TPlaceholder
 */
export function convertTreeNodes<
	TIn extends HasTraits<TIn | TPlaceholder>,
	TOut extends HasTraits<TOut | TPlaceholder>,
	TPlaceholder
>(
	root: TIn | TPlaceholder,
	convert: (node: TIn) => NoTraits<TOut> | undefined,
	isPlaceholder?: (node: TIn | TPlaceholder) => node is TPlaceholder
): TOut | TPlaceholder | undefined {
	if (isKnownType(root, isPlaceholder)) {
		return root;
	}

	const rootChildIterator = iterateChildren(Object.entries(root.traits))[Symbol.iterator]();
	const converted = convert(root);
	if (converted === undefined) {
		return undefined;
	}
	const convertedRoot = converted as Mutable<TOut>;
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
				const convertedChild = convert(child);
				if (convertedChild === undefined) {
					return undefined;
				}
				newChild = convertedChild as Mutable<TOut>;
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

/**
 * Visits an input tree in a depth-first pre-order traversal.
 * @param tree - the input tree
 * @param visitor - callback invoked for each node in the tree.
 */
export function walkTreeNodes<TIn extends HasTraits<TIn>>(tree: TIn, visitor: (node: TIn) => void): void;

/**
 * Visits an input tree containing placeholders in a depth-first pre-order traversal.
 * @param tree - the input tree
 * @param visitor - callback invoked for each node in the tree. Must return true if the given node is a TPlaceholder.
 */
export function walkTreeNodes<TIn extends HasTraits<TIn | TPlaceholder>, TPlaceholder = never>(
	tree: TIn | TPlaceholder,
	visitors:
		| ((node: TIn) => void)
		| { nodeVisitor?: (node: TIn) => void; placeholderVisitor?: (placeholder: TPlaceholder) => void },
	isPlaceholder: (node: TIn | TPlaceholder) => node is TPlaceholder
): void;

export function walkTreeNodes<TIn extends HasTraits<TIn | TPlaceholder>, TPlaceholder = never>(
	tree: TIn | TPlaceholder,
	visitors:
		| ((node: TIn) => void)
		| { nodeVisitor?: (node: TIn) => void; placeholderVisitor?: (placeholder: TPlaceholder) => void },
	isPlaceholder?: (node: TIn | TPlaceholder) => node is TPlaceholder
): void {
	const nodeVisitor = typeof visitors === 'function' ? visitors : visitors.nodeVisitor;
	const placeholderVisitor = typeof visitors === 'object' ? visitors.placeholderVisitor : undefined;
	if (isKnownType(tree, isPlaceholder)) {
		placeholderVisitor?.(tree);
		return;
	}
	nodeVisitor?.(tree);

	const childIterators: Iterator<[TraitLabel, TIn | TPlaceholder]>[] = [
		iterateChildren(Object.entries(tree.traits))[Symbol.iterator](),
	];

	while (childIterators.length > 0) {
		const childIterator = childIterators[childIterators.length - 1] ?? fail('Undefined node');
		const { value, done } = childIterator.next();
		if (done === true) {
			childIterators.pop();
		} else {
			const [_, child] = value as [TraitLabel, TIn | TPlaceholder];
			if (isKnownType(child, isPlaceholder)) {
				placeholderVisitor?.(child);
			} else {
				nodeVisitor?.(child);
				childIterators.push(iterateChildren(Object.entries(child.traits))[Symbol.iterator]());
			}
		}
	}
}

export function* iterateChildren<T>(traits: Iterable<[string, readonly T[]]>): Iterable<[TraitLabel, T]> {
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

/**
 * Check if two trees are equivalent, meaning they have the same descendants with the same properties.
 *
 * See {@link comparePayloads} for payload comparison semantics.
 */
export function deepCompareNodes(
	a: ChangeNode | ChangeNode_0_0_2,
	b: ChangeNode | ChangeNode_0_0_2,
	comparator: (a: NodeData | NodeData_0_0_2, b: NodeData | NodeData_0_0_2) => boolean = compareNodes
): boolean {
	if (a === b) {
		return true;
	}

	if (!comparator(a, b)) {
		return false;
	}

	const traitsA = Object.entries(a.traits);
	const traitsB = Object.entries(b.traits);

	if (traitsA.length !== traitsB.length) {
		return false;
	}

	for (const [traitLabel, childrenA] of traitsA) {
		const childrenB = b.traits[traitLabel];

		if (childrenA.length !== childrenB.length) {
			return false;
		}

		const traitsEqual = compareArrays<ChangeNode | ChangeNode_0_0_2>(childrenA, childrenB, (childA, childB) => {
			if (typeof childA === 'number' || typeof childB === 'number') {
				// Check if children are DetachedSequenceIds
				return childA === childB;
			}

			return deepCompareNodes(childA, childB);
		});

		if (!traitsEqual) {
			return false;
		}
	}

	return true;
}

/*
 * Returns true if two nodes have equivalent data and payloads, otherwise false.
 * Does not compare children
 * @param nodes - two or more nodes to compare
 */
export function compareNodes(a: NodeData | NodeData_0_0_2, b: NodeData | NodeData_0_0_2): boolean {
	if (a === b) {
		return true;
	}

	if (a.identifier !== b.identifier) {
		return false;
	}

	if (a.definition !== b.definition) {
		return false;
	}

	if (!comparePayloads(a.payload, b.payload)) {
		return false;
	}

	return true;
}

/**
 * Compare two views such that semantically equivalent node IDs are considered equal.
 */
export function areRevisionViewsSemanticallyEqual(
	treeViewA: TreeView,
	idConverterA: NodeIdConverter,
	treeViewB: TreeView,
	idConverterB: NodeIdConverter
): boolean {
	const treeA = getChangeNode_0_0_2FromView(treeViewA, idConverterA);
	const treeB = getChangeNode_0_0_2FromView(treeViewB, idConverterB);
	if (!deepCompareNodes(treeA, treeB)) {
		return false;
	}

	return true;
}

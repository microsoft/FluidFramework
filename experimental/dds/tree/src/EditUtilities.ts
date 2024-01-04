/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuidv4 } from 'uuid';
import { compareArrays } from '@fluidframework/core-utils';
import { copyPropertyIfDefined, fail, Mutable } from './Common';
import { Definition, DetachedSequenceId, EditId, NodeId, StableNodeId, TraitLabel } from './Identifiers';
import { NodeIdContext, NodeIdConverter } from './NodeIdUtilities';
import {
	BuildNodeInternal,
	ChangeInternal,
	ChangeNode,
	ChangeNode_0_0_2,
	Edit,
	HasTraits,
	NodeData,
	Side,
	StablePlaceInternal,
	StableRangeInternal,
	TraitLocationInternal,
	TraitMap,
	TreeNode,
	TreeNodeSequence,
} from './persisted-types';
import { TraitLocation, TreeView } from './TreeView';
import { BuildNode, BuildTreeNode, Change, HasVariadicTraits, StablePlace, StableRange } from './ChangeTypes';
import { placeFromStablePlace, rangeFromStableRange } from './TreeViewUtilities';
import { iterateChildren, TransactionView } from './RevisionView';
import { getChangeNode_0_0_2FromView } from './SerializationUtilities';
import { comparePayloads } from './PayloadUtilities';

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
 * A node type that does not require its children to be specified
 */
export type NoTraits<TChild extends HasVariadicTraits<unknown>> = Omit<TChild, keyof HasVariadicTraits<TChild>>;

/**
 * Transform an input tree into an isomorphic output tree
 * @param tree - the input tree
 * @param convert - a conversion function that will run on each node in the input tree to produce the output tree.
 */
export function convertTreeNodes<TIn extends HasVariadicTraits<TIn>, TOut extends HasTraits<TOut>>(
	root: TIn,
	convert: (node: TIn) => NoTraits<TOut>
): TOut;

/**
 * Transform an input tree into an isomorphic output tree
 * @param tree - the input tree
 * @param convert - a conversion function that will run on each (non-placeholder) node in the input tree to produce the output tree.
 * @param isPlaceholder - a predicate which determines if a node is a placeholder
 */
export function convertTreeNodes<
	TIn extends HasVariadicTraits<TIn | TPlaceholder>,
	TOut extends HasTraits<TOut | TPlaceholder>,
	TPlaceholder,
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
 * @param isPlaceholder - a predicate which determines if the given node is of type TPlaceholder
 */
export function convertTreeNodes<
	TIn extends HasVariadicTraits<TIn | TPlaceholder>,
	TOut extends HasTraits<TOut | TPlaceholder>,
	TPlaceholder,
>(
	root: TIn | TPlaceholder,
	convert: (node: TIn) => NoTraits<TOut>,
	isPlaceholder?: (node: TIn | TPlaceholder) => node is TPlaceholder
): TOut | TPlaceholder {
	if (isKnownType(root, isPlaceholder)) {
		return root;
	}

	const convertedRoot = convert(root) as TOut;
	// `convertedRoot` might be the same as `root`, in which case stash the children of `root` before wiping them from `convertedRoot`
	const rootTraits = (root as unknown as TOut) === convertedRoot ? { traits: root.traits } : root;
	(convertedRoot as Mutable<TOut>).traits = {};
	const pendingNodes: {
		childIterator: Iterator<[TraitLabel, TIn | TPlaceholder]>;
		newNode: Mutable<TOut>;
	}[] = [{ childIterator: iterateChildren(rootTraits)[Symbol.iterator](), newNode: convertedRoot }];

	while (pendingNodes.length > 0) {
		const { childIterator, newNode } = pendingNodes[pendingNodes.length - 1] ?? fail('Undefined node');
		const { value, done } = childIterator.next();
		if (done === true) {
			pendingNodes.pop();
		} else {
			const [traitLabel, child] = value as [TraitLabel, TIn | TPlaceholder];
			let convertedChild: TOut | TPlaceholder;
			if (!isKnownType(child, isPlaceholder)) {
				convertedChild = convert(child) as TOut;
				if (child.traits !== undefined) {
					const childTraits =
						(child as unknown as TOut) === convertedChild ? { traits: child.traits } : child;
					pendingNodes.push({
						childIterator: iterateChildren(childTraits)[Symbol.iterator](),
						newNode: convertedChild,
					});
				}
				(convertedChild as Mutable<TOut>).traits = {};
			} else {
				convertedChild = child;
			}
			const newTraits = newNode.traits as Mutable<TraitMap<TOut | TPlaceholder>>;
			let newTrait = newTraits[traitLabel];
			if (newTrait === undefined) {
				newTrait = [];
				newTraits[traitLabel] = newTrait;
			}
			(newTrait as (TOut | TPlaceholder)[]).push(convertedChild);
		}
	}

	return convertedRoot;
}

/**
 * Visits an input tree in a depth-first pre-order traversal.
 * @param tree - the input tree
 * @param visitor - callback invoked for each node in the tree.
 */
export function walkTree<TIn extends HasVariadicTraits<TIn>>(tree: TIn, visitor: (node: TIn) => void): void;

/**
 * Visits an input tree containing placeholders in a depth-first pre-order traversal.
 * @param tree - the input tree
 * @param visitor - callback invoked for each node in the tree. Must return true if the given node is a TPlaceholder.
 */
export function walkTree<TIn extends HasVariadicTraits<TIn | TPlaceholder>, TPlaceholder = never>(
	tree: TIn | TPlaceholder,
	visitors:
		| ((node: TIn) => void)
		| { nodeVisitor?: (node: TIn) => void; placeholderVisitor?: (placeholder: TPlaceholder) => void },
	isPlaceholder: (node: TIn | TPlaceholder) => node is TPlaceholder
): void;

export function walkTree<TIn extends HasVariadicTraits<TIn | TPlaceholder>, TPlaceholder = never>(
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

	const childIterators: Iterator<[TraitLabel, TIn | TPlaceholder]>[] = [iterateChildren(tree)[Symbol.iterator]()];

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
				childIterators.push(iterateChildren(child)[Symbol.iterator]());
			}
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
	comparator: (
		a: NodeData<NodeId> | NodeData<StableNodeId>,
		b: NodeData<NodeId> | NodeData<StableNodeId>
	) => boolean = compareNodes
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

/**
 * Returns true if two nodes have equivalent data and payloads, otherwise false.
 * Does not compare children
 * @param nodes - two or more nodes to compare
 */
export function compareNodes(
	a: NodeData<NodeId> | NodeData<StableNodeId>,
	b: NodeData<NodeId> | NodeData<StableNodeId>
): boolean {
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
 * @internal
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

/**
 * Create a sequence of changes that resets the contents of `trait`.
 * @internal
 */
export function setTrait(trait: TraitLocation, nodes: BuildNode | TreeNodeSequence<BuildNode>): Change[] {
	const id = 0 as DetachedSequenceId;
	const traitContents = StableRange.all(trait);
	return [Change.detach(traitContents), Change.build(nodes, id), Change.insert(id, traitContents.start)];
}

/**
 * Create a sequence of changes that resets the contents of `trait`.
 * @internal
 */
export function setTraitInternal(
	trait: TraitLocationInternal,
	nodes: TreeNodeSequence<BuildNodeInternal>
): ChangeInternal[] {
	const id = 0 as DetachedSequenceId;
	const traitContents = StableRangeInternal.all(trait);
	return [
		ChangeInternal.detach(traitContents),
		ChangeInternal.build(nodes, id),
		ChangeInternal.insert(id, traitContents.start),
	];
}

/**
 * Check the validity of the given `StablePlace`
 * @param view - the `TreeView` within which to validate the given place
 * @param place - the `StablePlace` to check
 */
export function validateStablePlace(
	view: TreeView,
	place: StablePlaceInternal
):
	| {
			result: PlaceValidationResult.Valid;
			side: Side;
			referenceSibling: NodeId;
			referenceTrait?: never;
	  }
	| {
			result: PlaceValidationResult.Valid;
			side: Side;
			referenceSibling?: never;
			referenceTrait: TraitLocation;
	  }
	| { result: Exclude<PlaceValidationResult, PlaceValidationResult.Valid> } {
	/* A StablePlace is valid if the following conditions are met:
	 *     1. A sibling or trait is defined.
	 *     2. If a sibling is defined, both it and its parent exist in the `TreeView`.
	 *     3. If a trait is defined, its parent node exists in the `TreeView`.
	 *     4. If a sibling and a trait location are both specified, the sibling needs to actually be in that trait.
	 */
	const { referenceSibling, referenceTrait } = place;

	// A well-formed `StablePlace` specifies exactly one of `referenceSibling` and `referenceTrait`.
	if (
		(referenceSibling === undefined && referenceTrait === undefined) ||
		(referenceSibling !== undefined && referenceTrait !== undefined)
	) {
		return { result: PlaceValidationResult.Malformed };
	}

	if (referenceSibling !== undefined) {
		if (!view.hasNode(referenceSibling)) {
			return { result: PlaceValidationResult.MissingSibling };
		}

		// Detached nodes and the root are invalid anchors.
		if (view.tryGetTraitLabel(referenceSibling) === undefined) {
			return { result: PlaceValidationResult.SiblingIsRootOrDetached };
		}

		return { result: PlaceValidationResult.Valid, side: place.side, referenceSibling };
	}

	if (referenceTrait === undefined) {
		return { result: PlaceValidationResult.MissingParent };
	}

	if (!view.hasNode(referenceTrait.parent)) {
		return { result: PlaceValidationResult.MissingParent };
	}

	return { result: PlaceValidationResult.Valid, side: place.side, referenceTrait };
}

/**
 * The result of validating a place.
 * @alpha
 */
export enum PlaceValidationResult {
	Valid = 'Valid',
	Malformed = 'Malformed',
	SiblingIsRootOrDetached = 'SiblingIsRootOrDetached',
	MissingSibling = 'MissingSibling',
	MissingParent = 'MissingParent',
}

/**
 * The result of validating a bad place.
 * @alpha
 */
export type BadPlaceValidationResult = Exclude<PlaceValidationResult, PlaceValidationResult.Valid>;

/**
 * Check the validity of the given `StableRange`
 * @param view - the `TreeView` within which to validate the given range
 * @param range - the `StableRange` to check
 */
export function validateStableRange(
	view: TreeView,
	range: StableRangeInternal
):
	| { result: RangeValidationResultKind.Valid; start: StablePlaceInternal; end: StablePlaceInternal }
	| { result: Exclude<RangeValidationResult, RangeValidationResultKind.Valid> } {
	/* A StableRange is valid if the following conditions are met:
	 *     1. Its start and end places are valid.
	 *     2. Its start and end places are within the same trait.
	 *     3. Its start place is before its end place.
	 */
	const { start, end } = range;

	const validatedStart = validateStablePlace(view, start);
	if (validatedStart.result !== PlaceValidationResult.Valid) {
		return {
			result: { kind: RangeValidationResultKind.BadPlace, place: start, placeFailure: validatedStart.result },
		};
	}

	const validatedEnd = validateStablePlace(view, end);
	if (validatedEnd.result !== PlaceValidationResult.Valid) {
		return { result: { kind: RangeValidationResultKind.BadPlace, place: end, placeFailure: validatedEnd.result } };
	}

	const startTraitLocation = validatedStart.referenceTrait ?? view.getTraitLocation(validatedStart.referenceSibling);
	const endTraitLocation = validatedEnd.referenceTrait ?? view.getTraitLocation(validatedEnd.referenceSibling);
	if (!compareTraits(startTraitLocation, endTraitLocation)) {
		return { result: RangeValidationResultKind.PlacesInDifferentTraits };
	}

	const { start: startPlace, end: endPlace } = rangeFromStableRange(view, {
		start: validatedStart,
		end: validatedEnd,
	});
	const startIndex = view.findIndexWithinTrait(startPlace);
	const endIndex = view.findIndexWithinTrait(endPlace);

	if (startIndex > endIndex) {
		return { result: RangeValidationResultKind.Inverted };
	}

	return { result: RangeValidationResultKind.Valid, start: validatedStart, end: validatedEnd };
}

/**
 * The kinds of result of validating a range.
 * @alpha
 */
export enum RangeValidationResultKind {
	Valid = 'Valid',
	BadPlace = 'BadPlace',
	PlacesInDifferentTraits = 'PlacesInDifferentTraits',
	Inverted = 'Inverted',
}

/**
 * The result of validating a range.
 * @alpha
 */
export type RangeValidationResult =
	| RangeValidationResultKind.Valid
	| RangeValidationResultKind.PlacesInDifferentTraits
	| RangeValidationResultKind.Inverted
	| {
			kind: RangeValidationResultKind.BadPlace;
			place: StablePlaceInternal;
			placeFailure: BadPlaceValidationResult;
	  };

/**
 * The result of validating a bad range.
 * @alpha
 */
export type BadRangeValidationResult = Exclude<RangeValidationResult, RangeValidationResultKind.Valid>;

/**
 * Check if two TraitLocations are equal.
 */
function compareTraits(traitA: TraitLocation, traitB: TraitLocation): boolean {
	if (traitA.label !== traitB.label || traitA.parent !== traitB.parent) {
		return false;
	}

	return true;
}

/**
 * Parents a set of nodes in a specified location within a trait.
 * @param nodesToInsert - the nodes to parent in the specified place. The nodes must already be present in the TreeView.
 * @param placeToInsert - the location to insert the nodes.
 */
export function insertIntoTrait(
	view: TransactionView,
	nodesToInsert: readonly NodeId[],
	placeToInsert: StablePlace
): TransactionView {
	return view.attachRange(nodesToInsert, placeFromStablePlace(view, placeToInsert));
}

/**
 * Detaches a range of nodes from their parent. The detached nodes remain in the TreeView.
 * @param rangeToDetach - the range of nodes to detach
 */
export function detachRange(
	view: TransactionView,
	rangeToDetach: StableRange
): { view: TransactionView; detached: readonly NodeId[] } {
	return view.detachRange(rangeFromStableRange(view, rangeToDetach));
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

/** Convert a node used in a Build change into its internal representation */
export function internalizeBuildNode(
	nodeData: BuildTreeNode,
	nodeIdContext: NodeIdContext
): Omit<TreeNode<BuildNodeInternal, NodeId>, 'traits'> {
	const output = {
		definition: nodeData.definition as Definition,
		identifier: nodeData.identifier ?? nodeIdContext.generateNodeId(),
	};
	copyPropertyIfDefined(nodeData, output, 'payload');
	return output;
}

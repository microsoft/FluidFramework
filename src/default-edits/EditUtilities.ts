/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DetachedSequenceId, NodeId } from '../Identifiers';
import { TreeView, TransactionView } from '../TreeView';
import { assertNotUndefined, copyPropertyIfDefined } from '../Common';
import { ChangeNode, NodeIdGenerator, StableTraitLocation, TreeNodeSequence } from '../generic';
import { BuildNodeInternal, ChangeInternal, StablePlace, StableRange } from './PersistedTypes';
import { BuildNode, BuildTreeNode, Change } from './ChangeTypes';

/**
 * Functions for constructing edits.
 */

/**
 * Create a sequence of changes that resets the contents of `trait`.
 * @public
 */
export function setTrait(trait: StableTraitLocation, nodes: TreeNodeSequence<BuildNode>): Change[] {
	const id = 0 as DetachedSequenceId;
	const traitContents = StableRange.all(trait);
	return [Change.detach(traitContents), Change.build(nodes, id), Change.insert(id, traitContents.start)];
}

/**
 * Create a sequence of changes that resets the contents of `trait`.
 * @internal
 */
export function setTraitInternal(
	trait: StableTraitLocation,
	nodes: TreeNodeSequence<BuildNodeInternal>
): ChangeInternal[] {
	const id = 0 as DetachedSequenceId;
	const traitContents = StableRange.all(trait);
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
export function validateStablePlace(view: TreeView, place: StablePlace): PlaceValidationResult {
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
		return PlaceValidationResult.Malformed;
	}

	if (referenceSibling !== undefined) {
		if (!view.hasNode(referenceSibling)) {
			return PlaceValidationResult.MissingSibling;
		}

		// Detached nodes and the root are invalid anchors.
		if (view.tryGetTraitLabel(referenceSibling) === undefined) {
			return PlaceValidationResult.SiblingIsRootOrDetached;
		}

		return PlaceValidationResult.Valid;
	}

	if (!view.hasNode(assertNotUndefined(referenceTrait).parent)) {
		return PlaceValidationResult.MissingParent;
	}

	return PlaceValidationResult.Valid;
}

/**
 * The result of validating a place.
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
 */
export type BadPlaceValidationResult = Exclude<PlaceValidationResult, PlaceValidationResult.Valid>;

/**
 * Check the validity of the given `StableRange`
 * @param view - the `TreeView` within which to validate the given range
 * @param range - the `StableRange` to check
 */
export function validateStableRange(view: TreeView, range: StableRange): RangeValidationResult {
	/* A StableRange is valid if the following conditions are met:
	 *     1. Its start and end places are valid.
	 *     2. Its start and end places are within the same trait.
	 *     3. Its start place is before its end place.
	 */
	const { start, end } = range;

	const startValidationResult = validateStablePlace(view, start);
	if (startValidationResult !== PlaceValidationResult.Valid) {
		return { kind: RangeValidationResultKind.BadPlace, place: start, placeFailure: startValidationResult };
	}

	const endValidationResult = validateStablePlace(view, end);
	if (endValidationResult !== PlaceValidationResult.Valid) {
		return { kind: RangeValidationResultKind.BadPlace, place: end, placeFailure: endValidationResult };
	}

	const startTraitLocation =
		start.referenceTrait || view.getTraitLocation(assertNotUndefined(start.referenceSibling));
	const endTraitLocation = end.referenceTrait || view.getTraitLocation(assertNotUndefined(end.referenceSibling));
	if (!compareTraits(startTraitLocation, endTraitLocation)) {
		return RangeValidationResultKind.PlacesInDifferentTraits;
	}

	const { start: startPlace, end: endPlace } = view.rangeFromStableRange(range);
	const startIndex = view.findIndexWithinTrait(startPlace);
	const endIndex = view.findIndexWithinTrait(endPlace);

	if (startIndex > endIndex) {
		return RangeValidationResultKind.Inverted;
	}

	return RangeValidationResultKind.Valid;
}

/**
 * The kinds of result of validating a range.
 */
export enum RangeValidationResultKind {
	Valid = 'Valid',
	BadPlace = 'BadPlace',
	PlacesInDifferentTraits = 'PlacesInDifferentTraits',
	Inverted = 'Inverted',
}

/**
 * The result of validating a range.
 */
export type RangeValidationResult =
	| RangeValidationResultKind.Valid
	| RangeValidationResultKind.PlacesInDifferentTraits
	| RangeValidationResultKind.Inverted
	| { kind: RangeValidationResultKind.BadPlace; place: StablePlace; placeFailure: BadPlaceValidationResult };

/**
 * The result of validating a bad range.
 */
export type BadRangeValidationResult = Exclude<RangeValidationResult, RangeValidationResultKind.Valid>;

/**
 * Check if two TraitLocations are equal.
 */
function compareTraits(traitA: StableTraitLocation, traitB: StableTraitLocation): boolean {
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
	return view.attachRange(nodesToInsert, view.placeFromStablePlace(placeToInsert));
}

/**
 * Detaches a range of nodes from their parent. The detached nodes remain in the TreeView.
 * @param rangeToDetach - the range of nodes to detach
 */
export function detachRange(
	view: TransactionView,
	rangeToDetach: StableRange
): { view: TransactionView; detached: readonly NodeId[] } {
	return view.detachRange(view.rangeFromStableRange(rangeToDetach));
}

/**
 * Determine if an BuildNode is a DetachedSequenceId.
 * @internal
 */
export function isDetachedSequenceId(node: BuildNode): node is DetachedSequenceId {
	return typeof node !== 'object';
}

/** Convert a tree used in a Build change into its internal representation */
export function internalizeBuildNode(
	nodeData: BuildTreeNode,
	nodeIdGenerator: NodeIdGenerator
): Omit<ChangeNode, 'traits'> {
	// TODO:#70358: Re-implement this method to use ids created by an IdCompressor
	const output = {
		definition: nodeData.definition,
		identifier: nodeData.identifier ?? nodeIdGenerator.generateNodeId(),
	};
	copyPropertyIfDefined(nodeData, output, 'payload');
	return output;
}

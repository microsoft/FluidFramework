/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DetachedSequenceId, NodeId } from '../Identifiers';
import { assertNotUndefined, copyPropertyIfDefined } from '../Common';
import {
	ChangeNode_0_0_2,
	NodeIdContext,
	NodeIdConverter,
	Side,
	TraitLocation,
	TraitLocation_0_0_2,
	TransactionView,
	TreeNodeSequence,
	TreeView,
	tryConvertToTraitLocation,
} from '../generic';
import { placeFromStablePlace, rangeFromStableRange } from '../TreeViewUtilities';
import { BuildNodeInternal, ChangeInternal, StablePlace_0_0_2, StableRange_0_0_2 } from './PersistedTypes';
import { BuildNode, BuildTreeNode, Change, StablePlace, StableRange } from './ChangeTypes';

/**
 * Functions for constructing edits.
 */

/**
 * Create a sequence of changes that resets the contents of `trait`.
 * @public
 */
export function setTrait(trait: TraitLocation, nodes: TreeNodeSequence<BuildNode>): Change[] {
	const id = 0 as DetachedSequenceId;
	const traitContents = StableRange.all(trait);
	return [Change.detach(traitContents), Change.build(nodes, id), Change.insert(id, traitContents.start)];
}

/**
 * Create a sequence of changes that resets the contents of `trait`.
 * @internal
 */
export function setTraitInternal(
	trait: TraitLocation_0_0_2,
	nodes: TreeNodeSequence<BuildNodeInternal>
): ChangeInternal[] {
	const id = 0 as DetachedSequenceId;
	const traitContents = StableRange_0_0_2.all(trait);
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
	place: StablePlace_0_0_2,
	idConverter: NodeIdConverter
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
		const sibling = idConverter.tryConvertToNodeId(referenceSibling);
		if (sibling === undefined || !view.hasNode(sibling)) {
			return { result: PlaceValidationResult.MissingSibling };
		}

		// Detached nodes and the root are invalid anchors.
		if (view.tryGetTraitLabel(sibling) === undefined) {
			return { result: PlaceValidationResult.SiblingIsRootOrDetached };
		}

		return { result: PlaceValidationResult.Valid, side: place.side, referenceSibling: sibling };
	}

	const trait = tryConvertToTraitLocation(assertNotUndefined(referenceTrait), idConverter);
	if (trait === undefined) {
		return { result: PlaceValidationResult.MissingParent };
	}

	if (!view.hasNode(trait.parent)) {
		return { result: PlaceValidationResult.MissingParent };
	}

	return { result: PlaceValidationResult.Valid, side: place.side, referenceTrait: trait };
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
export function validateStableRange(
	view: TreeView,
	range: StableRange_0_0_2,
	idConverter: NodeIdConverter
):
	| { result: RangeValidationResultKind.Valid; start: StablePlace; end: StablePlace }
	| { result: Exclude<RangeValidationResult, RangeValidationResultKind.Valid> } {
	/* A StableRange is valid if the following conditions are met:
	 *     1. Its start and end places are valid.
	 *     2. Its start and end places are within the same trait.
	 *     3. Its start place is before its end place.
	 */
	const { start, end } = range;

	const validatedStart = validateStablePlace(view, start, idConverter);
	if (validatedStart.result !== PlaceValidationResult.Valid) {
		return {
			result: { kind: RangeValidationResultKind.BadPlace, place: start, placeFailure: validatedStart.result },
		};
	}

	const validatedEnd = validateStablePlace(view, end, idConverter);
	if (validatedEnd.result !== PlaceValidationResult.Valid) {
		return { result: { kind: RangeValidationResultKind.BadPlace, place: end, placeFailure: validatedEnd.result } };
	}

	const startTraitLocation = validatedStart.referenceTrait || view.getTraitLocation(validatedStart.referenceSibling);
	const endTraitLocation = validatedEnd.referenceTrait || view.getTraitLocation(validatedEnd.referenceSibling);
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
	| { kind: RangeValidationResultKind.BadPlace; place: StablePlace_0_0_2; placeFailure: BadPlaceValidationResult };

/**
 * The result of validating a bad range.
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

/**
 * Determine if a node is a DetachedSequenceId.
 * @internal
 */
export function isDetachedSequenceId(node: BuildNode | BuildNodeInternal): node is DetachedSequenceId {
	return typeof node !== 'object';
}

/** Convert a tree used in a Build change into its internal representation */
export function internalizeBuildNode(
	nodeData: BuildTreeNode,
	nodeIdContext: NodeIdContext
): Omit<ChangeNode_0_0_2, 'traits'> {
	const output = {
		definition: nodeData.definition,
		identifier: nodeIdContext.convertToStableNodeId(nodeData.identifier ?? nodeIdContext.generateNodeId()),
	};
	copyPropertyIfDefined(nodeData, output, 'payload');
	return output;
}

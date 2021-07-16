/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DetachedSequenceId, NodeId } from '../Identifiers';
import { TreeView, TransactionView, TreeViewPlace, TreeViewRange } from '../TreeView';
import { assert, assertNotUndefined, fail } from '../Common';
import { EditValidationResult } from '../Checkout';
import { BuildNode, TraitLocation, TreeNodeSequence } from '../generic';
import { Change, StablePlace, StableRange } from './PersistedTypes';

/**
 * Functions for constructing edits.
 */

/**
 * Create a sequence of changes that resets the contents of `trait`.
 * @public
 */
export function setTrait(trait: TraitLocation, nodes: TreeNodeSequence<BuildNode>): readonly Change[] {
	const id = 0 as DetachedSequenceId;
	const traitContents = StableRange.all(trait);

	return [Change.detach(traitContents), Change.build(nodes, id), Change.insert(id, traitContents.start)];
}

/**
 * Check the validity of the given `StablePlace`
 * @param view - the `TreeView` within which to validate the given place
 * @param place - the `StablePlace` to check
 */
export function validateStablePlace(view: TreeView, place: StablePlace): EditValidationResult {
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
		return EditValidationResult.Malformed;
	}

	if (referenceSibling !== undefined) {
		if (!view.hasNode(referenceSibling)) {
			return EditValidationResult.Invalid;
		}

		// Detached nodes and the root are invalid anchors.
		if (view.getTraitLabel(referenceSibling) === undefined) {
			return EditValidationResult.Invalid;
		}

		return EditValidationResult.Valid;
	}

	if (!view.hasNode(assertNotUndefined(referenceTrait).parent)) {
		return EditValidationResult.Invalid;
	}

	return EditValidationResult.Valid;
}

/**
 * Check the validity of the given `StableRange`
 * @param view - the `TreeView` within which to validate the given range
 * @param range - the `StableRange` to check
 */
export function validateStableRange(view: TreeView, range: StableRange): EditValidationResult {
	/* A StableRange is valid if the following conditions are met:
	 *     1. Its start and end places are valid.
	 *     2. Its start and end places are within the same trait.
	 *     3. Its start place is before its end place.
	 */
	const { start, end } = range;

	const startValidationResult = validateStablePlace(view, start);
	if (startValidationResult !== EditValidationResult.Valid) {
		return startValidationResult;
	}

	const endValidationResult = validateStablePlace(view, end);
	if (endValidationResult !== EditValidationResult.Valid) {
		return endValidationResult;
	}

	const startTraitLocation =
		start.referenceTrait || view.getTraitLocation(assertNotUndefined(start.referenceSibling));
	const endTraitLocation = end.referenceTrait || view.getTraitLocation(assertNotUndefined(end.referenceSibling));
	if (!compareTraits(startTraitLocation, endTraitLocation)) {
		return EditValidationResult.Invalid;
	}

	const { start: startPlace, end: endPlace } = rangeFromStableRange(view, range);
	const startIndex = view.findIndexWithinTrait(startPlace);
	const endIndex = view.findIndexWithinTrait(endPlace);

	if (startIndex > endIndex) {
		return EditValidationResult.Invalid;
	}

	return EditValidationResult.Valid;
}

/**
 * @param view - the `TreeView` within which to retrieve the trait location
 * @param range - must be well formed and valid
 */
function getTraitLocationOfRange(view: TreeView, range: StableRange): TraitLocation {
	const referenceTrait = range.start.referenceTrait ?? range.end.referenceTrait;
	if (referenceTrait) {
		return referenceTrait;
	}
	const sibling =
		range.start.referenceSibling ?? range.end.referenceSibling ?? fail('malformed range does not indicate trait');
	return view.getTraitLocation(sibling);
}

/**
 * Describes the side of a range.
 */
enum SideOfRange {
	/**
	 * The start of the range
	 */
	Start = 0,
	/**
	 * The end of the range
	 */
	End = 1,
}

function sideOfRange(range: StableRange, sideOfRange: SideOfRange, trait: TraitLocation): TreeViewPlace {
	const siblingRelative = sideOfRange === SideOfRange.Start ? range.start : range.end;
	return {
		trait,
		side: siblingRelative.side,
		sibling: siblingRelative.referenceSibling,
	};
}

/**
 * Express the given `StableRange` as a `Range`
 */
export function rangeFromStableRange(view: TreeView, range: StableRange): TreeViewRange {
	const location = getTraitLocationOfRange(view, range);
	// This can be optimized for better constant factors.
	return {
		start: sideOfRange(range, SideOfRange.Start, location),
		end: sideOfRange(range, SideOfRange.End, location),
	};
}

/**
 * Express the given `StablePlace` as a `Place`
 */
export function placeFromStablePlace(view: TreeView, stablePlace: StablePlace): TreeViewPlace {
	const { side } = stablePlace;
	if (stablePlace.referenceSibling === undefined) {
		assert(stablePlace.referenceTrait !== undefined);
		return {
			trait: stablePlace.referenceTrait,
			side,
		};
	}
	return {
		trait: view.getTraitLocation(stablePlace.referenceSibling),
		side: stablePlace.side,
		sibling: stablePlace.referenceSibling,
	};
}

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
 * Determine if an BuildNode is a DetachedSequenceId.
 * @internal
 */
export function isDetachedSequenceId(node: BuildNode): node is DetachedSequenceId {
	return typeof node !== 'object';
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DetachedSequenceId, NodeId } from '../Identifiers';
import { Snapshot, SnapshotPlace, SnapshotRange } from '../Snapshot';
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
 * @param snapshot - the `Snapshot` within which to validate the given place
 * @param place - the `StablePlace` to check
 */
export function validateStablePlace(snapshot: Snapshot, place: StablePlace): EditValidationResult {
	/* A StablePlace is valid if the following conditions are met:
	 *     1. A sibling or trait is defined.
	 *     2. If a sibling is defined, both it and its parent exist in the `Snapshot`.
	 *     3. If a trait is defined, its parent node exists in the `Snapshot`.
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
		if (!snapshot.hasNode(referenceSibling)) {
			return EditValidationResult.Invalid;
		}

		// Detached nodes and the root are invalid anchors.
		if (snapshot.getTraitLabel(referenceSibling) === undefined) {
			return EditValidationResult.Invalid;
		}

		return EditValidationResult.Valid;
	}

	if (!snapshot.hasNode(assertNotUndefined(referenceTrait).parent)) {
		return EditValidationResult.Invalid;
	}

	return EditValidationResult.Valid;
}

/**
 * Check the validity of the given `StableRange`
 * @param snapshot - the `Snapshot` within which to validate the given range
 * @param range - the `StableRange` to check
 */
export function validateStableRange(snapshot: Snapshot, range: StableRange): EditValidationResult {
	/* A StableRange is valid if the following conditions are met:
	 *     1. Its start and end places are valid.
	 *     2. Its start and end places are within the same trait.
	 *     3. Its start place is before its end place.
	 */
	const { start, end } = range;

	const startValidationResult = validateStablePlace(snapshot, start);
	if (startValidationResult !== EditValidationResult.Valid) {
		return startValidationResult;
	}

	const endValidationResult = validateStablePlace(snapshot, end);
	if (endValidationResult !== EditValidationResult.Valid) {
		return endValidationResult;
	}

	const startTraitLocation =
		start.referenceTrait || snapshot.getTraitLocation(assertNotUndefined(start.referenceSibling));
	const endTraitLocation = end.referenceTrait || snapshot.getTraitLocation(assertNotUndefined(end.referenceSibling));
	if (!compareTraits(startTraitLocation, endTraitLocation)) {
		return EditValidationResult.Invalid;
	}

	const { start: startPlace, end: endPlace } = rangeFromStableRange(snapshot, range);
	const startIndex = snapshot.findIndexWithinTrait(startPlace);
	const endIndex = snapshot.findIndexWithinTrait(endPlace);

	if (startIndex > endIndex) {
		return EditValidationResult.Invalid;
	}

	return EditValidationResult.Valid;
}

/**
 * @param snapshot - the `Snapshot` within which to retrieve the trait location
 * @param range - must be well formed and valid
 */
function getTraitLocationOfRange(snapshot: Snapshot, range: StableRange): TraitLocation {
	const referenceTrait = range.start.referenceTrait ?? range.end.referenceTrait;
	if (referenceTrait) {
		return referenceTrait;
	}
	const sibling =
		range.start.referenceSibling ?? range.end.referenceSibling ?? fail('malformed range does not indicate trait');
	return snapshot.getTraitLocation(sibling);
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

function sideOfRange(range: StableRange, sideOfRange: SideOfRange, trait: TraitLocation): SnapshotPlace {
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
export function rangeFromStableRange(snapshot: Snapshot, range: StableRange): SnapshotRange {
	const location = getTraitLocationOfRange(snapshot, range);
	// This can be optimized for better constant factors.
	return {
		start: sideOfRange(range, SideOfRange.Start, location),
		end: sideOfRange(range, SideOfRange.End, location),
	};
}

/**
 * Express the given `StablePlace` as a `Place`
 */
export function placeFromStablePlace(snapshot: Snapshot, stablePlace: StablePlace): SnapshotPlace {
	const { side } = stablePlace;
	if (stablePlace.referenceSibling === undefined) {
		assert(stablePlace.referenceTrait !== undefined);
		return {
			trait: stablePlace.referenceTrait,
			side,
		};
	}
	return {
		trait: snapshot.getTraitLocation(stablePlace.referenceSibling),
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
 * @param nodesToInsert - the nodes to parent in the specified place. The nodes must already be present in the Snapshot.
 * @param placeToInsert - the location to insert the nodes.
 */
export function insertIntoTrait(
	snapshot: Snapshot,
	nodesToInsert: readonly NodeId[],
	placeToInsert: StablePlace
): Snapshot {
	return snapshot.attachRange(nodesToInsert, placeFromStablePlace(snapshot, placeToInsert));
}

/**
 * Detaches a range of nodes from their parent. The detached nodes remain in the Snapshot.
 * @param rangeToDetach - the range of nodes to detach
 */
export function detachRange(
	snapshot: Snapshot,
	rangeToDetach: StableRange
): { snapshot: Snapshot; detached: readonly NodeId[] } {
	return snapshot.detachRange(rangeFromStableRange(snapshot, rangeToDetach));
}

/**
 * Determine if an BuildNode is a DetachedSequenceId.
 * @internal
 */
export function isDetachedSequenceId(node: BuildNode): node is DetachedSequenceId {
	return typeof node !== 'object';
}

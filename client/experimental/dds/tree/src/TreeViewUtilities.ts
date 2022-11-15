/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StablePlace, StableRange } from './ChangeTypes';
import { assert, fail } from './Common';
import { TraitLocation, TreeView, TreeViewPlace, TreeViewRange } from './TreeView';

/**
 * Express the given {@link (StableRange:interface)} as a {@link TreeViewRange}
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
 * Express the given {@link (StablePlace:interface)} as a {@link TreeViewPlace}
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
 * Return the trait under which the given range resides
 * @param view - the {@link TreeView} within which to retrieve the trait location
 * @param range - must be well formed and valid
 */
export function getTraitLocationOfRange(view: TreeView, range: StableRange): TraitLocation {
	const referenceTrait = range.start.referenceTrait ?? range.end.referenceTrait;
	if (referenceTrait) {
		return referenceTrait;
	}
	const sibling =
		range.start.referenceSibling ?? range.end.referenceSibling ?? fail('malformed range does not indicate trait');
	return view.getTraitLocation(sibling);
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
 * Denotes either the start or end of a range
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

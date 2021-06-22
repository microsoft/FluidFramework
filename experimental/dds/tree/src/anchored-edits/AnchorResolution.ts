/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Side, Snapshot } from '../Snapshot';
import {
	Change,
	ChangeType,
	placeFromStablePlace,
	StablePlace,
	StableRange,
	validateStablePlace,
	validateStableRange,
} from '../default-edits';
import { assert, assertNotUndefined, fail } from '../Common';
import { EditValidationResult } from '../Checkout';
import { NodeId } from '../Identifiers';
import { ReconciliationPath } from '../ReconciliationPath';
import {
	AnchoredChange,
	NodeAnchor,
	PlaceAnchor,
	PlaceAnchorSemanticsChoice,
	RangeAnchor,
	RelativePlaceAnchor,
} from './PersistedTypes';

/**
 * A change and the snapshots that precede and succeed it.
 */
export interface EvaluatedChange<TChange> {
	readonly change: TChange;
	/**
	 * The snapshot before the change was applied.
	 */
	readonly before: Snapshot;
	/**
	 * The snapshot after the change was applied.
	 */
	readonly after: Snapshot;
}

/**
 * Object that includes a function for resolving node anchors.
 */
export interface HasNodeResolver {
	nodeResolver: (node: NodeAnchor, before: Snapshot, path: ReconciliationPath<AnchoredChange>) => NodeId | undefined;
}

/**
 * Object that includes a function for resolving place anchors.
 */
export interface HasPlaceResolver {
	placeResolver: (
		range: PlaceAnchor,
		before: Snapshot,
		path: ReconciliationPath<AnchoredChange>
	) => StablePlace | undefined;
}

/**
 * Object that includes a function for resolving range anchors.
 */
export interface HasRangeResolver {
	rangeResolver: (
		range: RangeAnchor,
		before: Snapshot,
		path: ReconciliationPath<AnchoredChange>
	) => StableRange | undefined;
}

/**
 * Object that includes a function for validating places.
 */
export interface HasPlaceValidator {
	placeValidator: (snapshot: Snapshot, place: StablePlace) => EditValidationResult;
}

/**
 * Reconciliates a given `change` in the face of concurrent edits described in a `ReconciliationPath`.
 * @param change - The anchor to reconciliate.
 * @param before - The state to which the `change` would be applied to.
 * @param path - The reconciliation path for the `change`.
 * @returns A `Change` that satisfies the same semantics of the given `change` but whose tree locations are valid in the `before` snapshot.
 *   Undefined if no such change can be produced.
 * @internal
 */
export function resolveChangeAnchors(
	change: AnchoredChange,
	before: Snapshot,
	path: ReconciliationPath<AnchoredChange>
): Change | undefined;

/**
 * For testing purposes only.
 * @internal
 */
export function resolveChangeAnchors(
	change: AnchoredChange,
	before: Snapshot,
	path: ReconciliationPath<AnchoredChange>,
	dependencies?: HasNodeResolver & HasPlaceResolver & HasRangeResolver
): Change | undefined;

export function resolveChangeAnchors(
	change: AnchoredChange,
	before: Snapshot,
	path: ReconciliationPath<AnchoredChange>,
	{ nodeResolver, placeResolver, rangeResolver }: HasNodeResolver & HasPlaceResolver & HasRangeResolver = {
		nodeResolver: resolveNodeAnchor,
		placeResolver: resolvePlaceAnchor,
		rangeResolver: resolveRangeAnchor,
	}
): Change | undefined {
	switch (change.type) {
		case ChangeType.Build:
			return change;
		case ChangeType.Insert: {
			const destination = placeResolver(change.destination, before, path);
			return destination !== undefined ? { ...change, destination } : undefined;
		}
		case ChangeType.Detach: {
			const source = rangeResolver(change.source, before, path);
			return source !== undefined ? { ...change, source } : undefined;
		}
		case ChangeType.Constraint: {
			const toConstrain = rangeResolver(change.toConstrain, before, path);
			return toConstrain !== undefined ? { ...change, toConstrain } : undefined;
		}
		case ChangeType.SetValue: {
			const nodeToModify = nodeResolver(change.nodeToModify, before, path);
			return nodeToModify !== undefined ? { ...change, nodeToModify } : undefined;
		}
		default:
			return fail('Attempted to reconciliate unsupported change');
	}
}

/**
 * Resolves a given `node` anchor in the face of a `ReconciliationPath`.
 * @param node - The anchor to resolve.
 * @param before - The state to which the change that the `node` anchor should be applied to.
 * @param path - The reconciliation path for the change that the `node` is part of.
 * @returns A matching `NodeId` that is valid in the snapshot at the end of the `path`. Undefined if no such node exists.
 * @internal
 */
export function resolveNodeAnchor(
	node: NodeAnchor,
	before: Snapshot,
	path: ReconciliationPath<AnchoredChange>
): NodeId | undefined {
	return before.hasNode(node) ? node : undefined;
}

/**
 * Resolves a given `range` anchor in the face of a `ReconciliationPath`.
 * @param range - The anchor to resolve.
 * @param before - The state to which the change that the `range` anchor should be applied to.
 * @param path - The reconciliation path for the change that the `range` is part of.
 * @returns A matching `StableRange` that is valid in the snapshot at the end of the `path`. Undefined if no such valid range exists.
 * @internal
 */
export function resolveRangeAnchor(
	range: RangeAnchor,
	before: Snapshot,
	path: ReconciliationPath<AnchoredChange>
): StableRange | undefined;

/**
 * For testing purposes only.
 * @internal
 */
export function resolveRangeAnchor(
	range: RangeAnchor,
	before: Snapshot,
	path: ReconciliationPath<AnchoredChange>,
	dependencies?: HasPlaceResolver & {
		rangeValidator: (snapshot: Snapshot, range: StableRange) => EditValidationResult;
	}
): StableRange | undefined;

export function resolveRangeAnchor(
	range: RangeAnchor,
	before: Snapshot,
	path: ReconciliationPath<AnchoredChange>,
	{
		placeResolver,
		rangeValidator,
	}: HasPlaceResolver & {
		rangeValidator: (snapshot: Snapshot, range: StableRange) => EditValidationResult;
	} = {
		placeResolver: resolvePlaceAnchor,
		rangeValidator: validateStableRange,
	}
): StableRange | undefined {
	const start = placeResolver(range.start, before, path);
	if (start !== undefined) {
		const end = placeResolver(range.end, before, path);
		if (end !== undefined) {
			const resolvedRange = {
				start,
				end,
			};
			return rangeValidator(before, resolvedRange) === EditValidationResult.Valid ? resolvedRange : undefined;
		}
	}
	return undefined;
}

/**
 * Resolves a given `place` anchor in the face of a `ReconciliationPath`.
 * @param place - The anchor to resolve.
 * @param before - The state to which the change that the `place` anchor should be applied to.
 * @param path - The reconciliation path for the change that the `place` is part of.
 * @returns A matching `StablePlace` that is valid in the snapshot at the end of the `path`. Undefined if no such valid place exists.
 * @internal
 */
export function resolvePlaceAnchor(
	place: PlaceAnchor,
	before: Snapshot,
	path: ReconciliationPath<AnchoredChange>
): StablePlace | undefined;

/**
 * For testing purposes only.
 * @internal
 */
export function resolvePlaceAnchor(
	place: PlaceAnchor,
	before: Snapshot,
	path: ReconciliationPath<AnchoredChange>,
	dependencies?: HasPlaceValidator & {
		placeUpdatorForPath: (
			place: RelativePlaceAnchor,
			path: ReconciliationPath<AnchoredChange>
		) => PlaceAnchor | undefined;
	}
): StablePlace | undefined;

export function resolvePlaceAnchor(
	place: PlaceAnchor,
	before: Snapshot,
	path: ReconciliationPath<AnchoredChange>,
	{
		placeValidator,
		placeUpdatorForPath,
	}: HasPlaceValidator & {
		placeUpdatorForPath: (
			place: RelativePlaceAnchor,
			path: ReconciliationPath<AnchoredChange>
		) => PlaceAnchor | undefined;
	} = {
		placeValidator: validateStablePlace,
		placeUpdatorForPath: updateRelativePlaceAnchorForPath,
	}
): StablePlace | undefined {
	let newPlace: PlaceAnchor | undefined = place;
	while (newPlace !== undefined && placeValidator(before, newPlace) !== EditValidationResult.Valid) {
		switch (newPlace.semantics) {
			case PlaceAnchorSemanticsChoice.RelativeToNode: {
				newPlace = placeUpdatorForPath(newPlace as RelativePlaceAnchor, path);
				break;
			}
			case PlaceAnchorSemanticsChoice.BoundToNode:
			case undefined:
				// There's nothing we can do to fix this place
				newPlace = undefined;
				break;
			default:
				fail('Unsupported choice of PlaceAnchorSemanticsChoice');
		}
	}
	return newPlace;
}

/**
 * Updates a given `place` anchor in the face of a `ReconciliationPath` that violates its semantics.
 * @param place - The anchor to update. Assumed to be invalid after the latest change.
 * @param path - The sequence of edits that violates the anchor's semantics.
 * @returns A place anchor whose semantics are inline with the given `place`, and valid after the most recent change that made it invalid.
 *   Undefined if those semantics cannot be preserved.
 * @internal
 */
export function updateRelativePlaceAnchorForPath(
	place: RelativePlaceAnchor,
	path: ReconciliationPath<AnchoredChange>
): PlaceAnchor | undefined;

/**
 * For testing purposes only.
 * @internal
 */
export function updateRelativePlaceAnchorForPath(
	place: RelativePlaceAnchor,
	path: ReconciliationPath<AnchoredChange>,
	dependencies?: {
		lastOffendingChangeFinder: (
			place: RelativePlaceAnchor,
			path: ReconciliationPath<AnchoredChange>
		) => EvaluatedChange<AnchoredChange> | undefined;
		placeUpdatorForChange: (
			place: RelativePlaceAnchor,
			change: EvaluatedChange<AnchoredChange>
		) => PlaceAnchor | undefined;
	}
): PlaceAnchor | undefined;

export function updateRelativePlaceAnchorForPath(
	place: RelativePlaceAnchor,
	path: ReconciliationPath<AnchoredChange>,
	{
		lastOffendingChangeFinder,
		placeUpdatorForChange,
	}: {
		lastOffendingChangeFinder: (
			place: RelativePlaceAnchor,
			path: ReconciliationPath<AnchoredChange>
		) => EvaluatedChange<AnchoredChange> | undefined;
		placeUpdatorForChange: (
			place: RelativePlaceAnchor,
			change: EvaluatedChange<AnchoredChange>
		) => PlaceAnchor | undefined;
	} = {
		lastOffendingChangeFinder: findLastOffendingChange,
		placeUpdatorForChange: updateRelativePlaceAnchorForChange,
	}
): PlaceAnchor | undefined {
	if (place.referenceSibling === undefined) {
		// Start and end places cannot be updated.
		return undefined;
	}
	const lastOffendingChange = lastOffendingChangeFinder(place, path);
	return lastOffendingChange === undefined ? undefined : placeUpdatorForChange(place, lastOffendingChange);
}

/**
 * Finds the latest change in the given `path` that last made the given `place` invalid.
 * @param place - A anchor that is invalid in the last snapshot on the path.
 * @param path - The sequence of edits that violates the anchor's semantics.
 * @returns The change that last made the given `place` invalid and the snapshots before and after it. Undefined if `place` was never valid.
 * @internal
 */
export function findLastOffendingChange(
	place: RelativePlaceAnchor,
	path: ReconciliationPath<AnchoredChange>
): EvaluatedChange<AnchoredChange> | undefined;

/**
 * For testing purposes only.
 * @internal
 */
export function findLastOffendingChange(
	place: RelativePlaceAnchor,
	path: ReconciliationPath<AnchoredChange>,
	dependencies?: HasPlaceValidator
): EvaluatedChange<AnchoredChange> | undefined;

export function findLastOffendingChange(
	place: RelativePlaceAnchor,
	path: ReconciliationPath<AnchoredChange>,
	{ placeValidator }: HasPlaceValidator = {
		placeValidator: validateStablePlace,
	}
): EvaluatedChange<AnchoredChange> | undefined {
	let followingChange: { change: AnchoredChange; after: Snapshot } | undefined;
	for (let editIndex = path.length - 1; editIndex >= 0; --editIndex) {
		const edit = path[editIndex];
		for (let changeIndex = edit.length - 1; changeIndex >= 0; --changeIndex) {
			const change = edit[changeIndex];
			const placeStatusAfterChange = placeValidator(change.after, place);
			if (placeStatusAfterChange === EditValidationResult.Valid) {
				return {
					before: change.after,
					...assertNotUndefined(followingChange, 'The last change should not make the place valid'),
				};
			}
			followingChange = {
				change: change.resolvedChange,
				after: change.after,
			};
		}
	}
	return path.length > 0 && placeValidator(path[0].before, place) === EditValidationResult.Valid
		? {
				before: path[0].before,
				...assertNotUndefined(followingChange, 'The last change should not make the place valid'),
		  }
		: // The place was never valid
		  undefined;
}

/**
 * Updates a given `place` anchor in the face of a change that violates its semantics.
 * @param place - The anchor to update.
 * @param change - The change that violates the anchor's semantics.
 * @returns A place anchor that is valid after the given `change` and in line with the original `place`'s semantics.
 *   Undefined if those semantics cannot be preserved.
 * @internal
 */
export function updateRelativePlaceAnchorForChange(
	place: RelativePlaceAnchor,
	change: EvaluatedChange<AnchoredChange>
): PlaceAnchor | undefined;

export function updateRelativePlaceAnchorForChange(
	place: RelativePlaceAnchor,
	{ change, before }: EvaluatedChange<AnchoredChange>
): PlaceAnchor | undefined {
	if (place.referenceSibling === undefined) {
		// A start or end place cannot be further updated
		return undefined;
	}
	assert(change.type === ChangeType.Detach, 'A PlaceAnchor can only be made invalid by a detach change');
	const targetPlace = placeFromStablePlace(before, place);
	const startPlace = placeFromStablePlace(before, change.source.start);
	const endPlace = placeFromStablePlace(before, change.source.end);
	if (targetPlace.trait.parent !== startPlace.trait.parent) {
		// The target place was detached indirectly by detaching its parent.
		// The anchor cannot recover.
		return undefined;
	}
	let newIndex;
	if (targetPlace.side === Side.After) {
		newIndex = before.findIndexWithinTrait(startPlace) - 1;
	}
	if (targetPlace.side === Side.Before) {
		newIndex = before.findIndexWithinTrait(endPlace);
	}
	const referenceTrait = targetPlace.trait;
	const parentNode = before.getSnapshotNode(referenceTrait.parent);
	const traits = new Map(parentNode.traits);
	const trait = assertNotUndefined(
		traits.get(referenceTrait.label),
		'The trait must have been populated before the deletion'
	);
	const referenceSibling = trait[newIndex];
	if (referenceSibling === undefined) {
		return { referenceTrait, side: place.side, semantics: place.semantics };
	}
	return { referenceSibling, side: place.side, semantics: place.semantics };
}

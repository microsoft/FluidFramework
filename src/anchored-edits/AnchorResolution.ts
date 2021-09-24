/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Side, TreeView } from '../TreeView';
import {
	BadRangeValidationResult,
	Change,
	ChangeType,
	Detach,
	placeFromStablePlace,
	PlaceValidationResult,
	RangeValidationResult,
	RangeValidationResultKind,
	StablePlace,
	StableRange,
	validateStablePlace,
	validateStableRange,
} from '../default-edits';
import { assert, assertNotUndefined, fail, Result } from '../Common';
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

export enum ResolutionFailureKind {
	UnresolvedID = 'UnresolvedID',
	UnresolvedPlace = 'UnresolvedPlace',
	UnresolvedRange = 'UnresolvedRange',
}

export type ResolutionFailure = PlaceResolutionFailure | RangeResolutionFailure | NodeResolutionFailure;

export interface NodeResolutionFailure {
	kind: ResolutionFailureKind.UnresolvedID;
	id: NodeId;
}

export interface RangeResolutionFailure {
	kind: ResolutionFailureKind.UnresolvedRange;
	/** The range as it was before any resolution attempt was made */
	originalRange: StableRange;
	rangeFailure: RangeUpdateFailure;
}

export enum RangeUpdateFailureKind {
	ResolvedPlacesMakeBadRange = 'ResolvedPlacesMakeBadRange',
	PlaceUpdateFailure = 'PlaceUpdateFailure',
}

export type RangeUpdateFailure =
	| {
			kind: RangeUpdateFailureKind.ResolvedPlacesMakeBadRange;
			resolvedStart: StablePlace;
			resolvedEnd: StablePlace;
			rangeFailure: BadRangeValidationResult;
	  }
	| {
			kind: RangeUpdateFailureKind.PlaceUpdateFailure;
			place: StablePlace;
			placeFailure: PlaceUpdateFailure;
	  };

export interface PlaceResolutionFailure {
	kind: ResolutionFailureKind.UnresolvedPlace;
	/** The place as it was before any resolution attempt was made */
	originalPlace: StablePlace;
	placeFailure: PlaceUpdateFailure;
}

export enum PlaceUpdateFailureKind {
	DeletedParent = 'DeletedParent',
	PlaceWasNeverValid = 'PlaceWasNeverValid',
}

export type PlaceUpdateFailure =
	| PlaceUpdateDeletedParentFailure
	| {
			kind: PlaceUpdateFailureKind.PlaceWasNeverValid;
			place: StablePlace;
	  };

export interface PlaceUpdateDeletedParentFailure {
	kind: PlaceUpdateFailureKind.DeletedParent;
	place: StablePlace;
	parent: NodeId;
	detach: Detach;
}

/**
 * A change and the views that precede and succeed it.
 */
export interface EvaluatedChange<TChange> {
	readonly change: TChange;
	/**
	 * The view before the change was applied.
	 */
	readonly before: TreeView;
	/**
	 * The view after the change was applied.
	 */
	readonly after: TreeView;
}

/**
 * Object that includes a function for resolving node anchors.
 */
export interface HasNodeResolver {
	readonly nodeResolver: (
		node: NodeAnchor,
		before: TreeView,
		path: ReconciliationPath<AnchoredChange>
	) => Result<NodeId, NodeResolutionFailure>;
}

/**
 * Object that includes a function for resolving place anchors.
 */
export interface HasPlaceResolver {
	readonly placeResolver: (
		range: PlaceAnchor,
		before: TreeView,
		path: ReconciliationPath<AnchoredChange>
	) => Result<StablePlace, PlaceResolutionFailure>;
}

/**
 * Object that includes a function for resolving range anchors.
 */
export interface HasRangeResolver {
	readonly rangeResolver: (
		range: RangeAnchor,
		before: TreeView,
		path: ReconciliationPath<AnchoredChange>
	) => Result<StableRange, RangeResolutionFailure>;
}

/**
 * Object that includes a function for validating places.
 */
export interface HasPlaceValidator {
	readonly placeValidator: (view: TreeView, place: StablePlace) => PlaceValidationResult;
}

/**
 * Reconciliates a given `change` in the face of concurrent edits described in a `ReconciliationPath`.
 * @param change - The anchor to reconciliate.
 * @param before - The state to which the `change` would be applied to.
 * @param path - The reconciliation path for the `change`.
 * @returns A `Change` that satisfies the same semantics of the given `change` but whose tree locations are valid in the `before` view.
 *   Undefined if no such change can be produced.
 * @internal
 */
export function resolveChangeAnchors(
	change: AnchoredChange,
	before: TreeView,
	path: ReconciliationPath<AnchoredChange>
): Result<Change, ResolutionFailure>;

/**
 * For testing purposes only.
 * @internal
 */
export function resolveChangeAnchors(
	change: AnchoredChange,
	before: TreeView,
	path: ReconciliationPath<AnchoredChange>,
	dependencies?: HasNodeResolver & HasPlaceResolver & HasRangeResolver
): Result<Change, ResolutionFailure>;

export function resolveChangeAnchors(
	change: AnchoredChange,
	before: TreeView,
	path: ReconciliationPath<AnchoredChange>,
	{ nodeResolver, placeResolver, rangeResolver }: HasNodeResolver & HasPlaceResolver & HasRangeResolver = {
		nodeResolver: resolveNodeAnchor,
		placeResolver: resolvePlaceAnchor,
		rangeResolver: resolveRangeAnchor,
	}
): Result<Change, ResolutionFailure> {
	switch (change.type) {
		case ChangeType.Build:
			return Result.ok(change);
		case ChangeType.Insert: {
			const placeResult = placeResolver(change.destination, before, path);
			return Result.mapOk(placeResult, (destination) => ({ ...change, destination }));
		}
		case ChangeType.Detach: {
			const rangeResult = rangeResolver(change.source, before, path);
			return Result.mapOk(rangeResult, (source) => ({ ...change, source }));
		}
		case ChangeType.Constraint: {
			const rangeResult = rangeResolver(change.toConstrain, before, path);
			return Result.mapOk(rangeResult, (toConstrain) => ({ ...change, toConstrain }));
		}
		case ChangeType.SetValue: {
			const nodeResult = nodeResolver(change.nodeToModify, before, path);
			return Result.mapOk(nodeResult, (nodeToModify) => ({ ...change, nodeToModify }));
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
 * @returns A matching `NodeId` that is valid in the view at the end of the `path`. Undefined if no such node exists.
 * @internal
 */
export function resolveNodeAnchor(
	node: NodeAnchor,
	before: TreeView,
	path: ReconciliationPath<AnchoredChange>
): Result<NodeId, NodeResolutionFailure> {
	return before.hasNode(node)
		? Result.ok(node)
		: Result.error({
				kind: ResolutionFailureKind.UnresolvedID,
				id: node,
		  });
}

/**
 * Resolves a given `range` anchor in the face of a `ReconciliationPath`.
 * @param range - The anchor to resolve.
 * @param before - The state to which the change that the `range` anchor should be applied to.
 * @param path - The reconciliation path for the change that the `range` is part of.
 * @returns A matching `StableRange` that is valid in the view at the end of the `path`. Undefined if no such valid range exists.
 * @internal
 */
export function resolveRangeAnchor(
	range: RangeAnchor,
	before: TreeView,
	path: ReconciliationPath<AnchoredChange>
): Result<StableRange, RangeResolutionFailure>;

/**
 * For testing purposes only.
 * @internal
 */
export function resolveRangeAnchor(
	range: RangeAnchor,
	before: TreeView,
	path: ReconciliationPath<AnchoredChange>,
	dependencies?: HasPlaceResolver & {
		rangeValidator: (view: TreeView, range: StableRange) => RangeValidationResult;
	}
): Result<StableRange, RangeResolutionFailure>;

export function resolveRangeAnchor(
	originalRange: RangeAnchor,
	before: TreeView,
	path: ReconciliationPath<AnchoredChange>,
	{
		placeResolver,
		rangeValidator,
	}: HasPlaceResolver & {
		rangeValidator: (view: TreeView, range: StableRange) => RangeValidationResult;
	} = {
		placeResolver: resolvePlaceAnchor,
		rangeValidator: validateStableRange,
	}
): Result<StableRange, RangeResolutionFailure> {
	const startResult = placeResolver(originalRange.start, before, path);
	if (Result.isOk(startResult)) {
		const endResult = placeResolver(originalRange.end, before, path);
		if (Result.isOk(endResult)) {
			const resolvedRange = {
				start: startResult.result,
				end: endResult.result,
			};
			const rangeValidationResult = rangeValidator(before, resolvedRange);
			if (rangeValidationResult === RangeValidationResultKind.Valid) {
				return Result.ok(resolvedRange);
			}
			return Result.error({
				kind: ResolutionFailureKind.UnresolvedRange,
				originalRange,
				rangeFailure: {
					kind: RangeUpdateFailureKind.ResolvedPlacesMakeBadRange,
					resolvedStart: startResult.result,
					resolvedEnd: endResult.result,
					rangeFailure: rangeValidationResult,
				},
			});
		}
		return Result.error({
			kind: ResolutionFailureKind.UnresolvedRange,
			originalRange,
			rangeFailure: {
				kind: RangeUpdateFailureKind.PlaceUpdateFailure,
				place: originalRange.end,
				placeFailure: endResult.error.placeFailure,
			},
		});
	}
	return Result.error({
		kind: ResolutionFailureKind.UnresolvedRange,
		originalRange,
		rangeFailure: {
			kind: RangeUpdateFailureKind.PlaceUpdateFailure,
			place: originalRange.start,
			placeFailure: startResult.error.placeFailure,
		},
	});
}

/**
 * Resolves a given `place` anchor in the face of a `ReconciliationPath`.
 * @param place - The anchor to resolve.
 * @param before - The state to which the change that the `place` anchor should be applied to.
 * @param path - The reconciliation path for the change that the `place` is part of.
 * @returns A matching `StablePlace` that is valid in the view at the end of the `path`. Undefined if no such valid place exists.
 * @internal
 */
export function resolvePlaceAnchor(
	place: PlaceAnchor,
	before: TreeView,
	path: ReconciliationPath<AnchoredChange>
): Result<StablePlace, PlaceResolutionFailure>;

/**
 * For testing purposes only.
 * @internal
 */
export function resolvePlaceAnchor(
	place: PlaceAnchor,
	before: TreeView,
	path: ReconciliationPath<AnchoredChange>,
	dependencies?: HasPlaceValidator & {
		placeUpdatorForPath: (
			place: RelativePlaceAnchor,
			path: ReconciliationPath<AnchoredChange>
		) => Result<PlaceAnchor, PlaceUpdateFailure>;
	}
): Result<StablePlace, ResolutionFailure>;

export function resolvePlaceAnchor(
	originalPlace: PlaceAnchor,
	before: TreeView,
	path: ReconciliationPath<AnchoredChange>,
	{
		placeValidator,
		placeUpdatorForPath,
	}: HasPlaceValidator & {
		placeUpdatorForPath: (
			place: RelativePlaceAnchor,
			path: ReconciliationPath<AnchoredChange>
		) => Result<PlaceAnchor, PlaceUpdateFailure>;
	} = {
		placeValidator: validateStablePlace,
		placeUpdatorForPath: updateRelativePlaceAnchorForPath,
	}
): Result<StablePlace, PlaceResolutionFailure> {
	let newPlace: Result<PlaceAnchor, PlaceUpdateFailure> = Result.ok(originalPlace);
	// This loop will terminate because each successful call to placeUpdatorForPath brings newPlace closer to being valid at the end of the
	// `path`.
	for (;;) {
		if (Result.isOk(newPlace)) {
			const placeValidation = placeValidator(before, newPlace.result);
			if (placeValidation === PlaceValidationResult.Valid) {
				return newPlace;
			}
			switch (newPlace.result.semantics) {
				case PlaceAnchorSemanticsChoice.RelativeToNode: {
					newPlace = placeUpdatorForPath(newPlace.result as RelativePlaceAnchor, path);
					break;
				}
				case PlaceAnchorSemanticsChoice.BoundToNode:
				case undefined:
					// This place should not be updated
					return newPlace;
				default:
					fail('Unsupported choice of PlaceAnchorSemanticsChoice');
			}
		} else {
			return Result.error({
				kind: ResolutionFailureKind.UnresolvedPlace,
				// We want the error to include the original place
				originalPlace,
				placeFailure: newPlace.error,
			});
		}
	}
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
): Result<PlaceAnchor, PlaceUpdateFailure>;

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
		) => Result<PlaceAnchor, PlaceUpdateFailure>;
	}
): Result<PlaceAnchor, PlaceUpdateFailure> | undefined;

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
		) => Result<PlaceAnchor, PlaceUpdateFailure>;
	} = {
		lastOffendingChangeFinder: findLastOffendingChange,
		placeUpdatorForChange: updateRelativePlaceAnchorForChange,
	}
): Result<PlaceAnchor, PlaceUpdateFailure> | undefined {
	const lastOffendingChange = lastOffendingChangeFinder(place, path);
	if (lastOffendingChange === undefined) {
		return Result.error({
			kind: PlaceUpdateFailureKind.PlaceWasNeverValid,
			place,
		});
	}
	return placeUpdatorForChange(place, lastOffendingChange);
}

/**
 * Finds the latest change in the given `path` that last made the given `place` invalid.
 * @param place - A anchor that is invalid in the last view on the path.
 * @param path - The sequence of edits that violates the anchor's semantics.
 * @returns The change that last made the given `place` invalid and the views before and after it. Undefined if `place` was never valid.
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
	let followingChange: { change: AnchoredChange; after: TreeView } | undefined;
	for (let editIndex = path.length - 1; editIndex >= 0; --editIndex) {
		const edit = path[editIndex];
		for (let changeIndex = edit.length - 1; changeIndex >= 0; --changeIndex) {
			const change = edit[changeIndex];
			const placeStatusAfterChange = placeValidator(change.after, place);
			if (placeStatusAfterChange === PlaceValidationResult.Valid) {
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
	return path.length > 0 && placeValidator(path[0].before, place) === PlaceValidationResult.Valid
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
): Result<PlaceAnchor, PlaceUpdateDeletedParentFailure>;

export function updateRelativePlaceAnchorForChange(
	place: RelativePlaceAnchor,
	{ change, before }: EvaluatedChange<AnchoredChange>
): Result<PlaceAnchor, PlaceUpdateDeletedParentFailure> {
	assert(change.type === ChangeType.Detach, 'A PlaceAnchor can only be made invalid by a detach change');
	if (place.referenceSibling === undefined) {
		const referenceTrait = assertNotUndefined(place.referenceTrait, 'Malformed places should be detected earlier');
		// A start or end place cannot be further updated
		return Result.error({
			kind: PlaceUpdateFailureKind.DeletedParent,
			place,
			parent: referenceTrait.parent,
			detach: change,
		});
	}
	const targetPlace = placeFromStablePlace(before, place);
	const startPlace = placeFromStablePlace(before, change.source.start);
	const endPlace = placeFromStablePlace(before, change.source.end);
	if (targetPlace.trait.parent !== startPlace.trait.parent) {
		// The target place was detached indirectly by detaching its parent.
		// The anchor cannot recover.
		return Result.error({
			kind: PlaceUpdateFailureKind.DeletedParent,
			place,
			parent: targetPlace.trait.parent,
			detach: change,
		});
	}
	let newIndex;
	if (targetPlace.side === Side.After) {
		newIndex = before.findIndexWithinTrait(startPlace) - 1;
	}
	if (targetPlace.side === Side.Before) {
		newIndex = before.findIndexWithinTrait(endPlace);
	}
	const referenceTrait = targetPlace.trait;
	const parentNode = before.getViewNode(referenceTrait.parent);
	const traits = new Map(parentNode.traits);
	const trait = assertNotUndefined(
		traits.get(referenceTrait.label),
		'The trait must have been populated before the deletion'
	);
	const referenceSibling = trait[newIndex];
	if (referenceSibling === undefined) {
		return Result.ok({ referenceTrait, side: place.side, semantics: place.semantics });
	}
	return Result.ok({ referenceSibling, side: place.side, semantics: place.semantics });
}

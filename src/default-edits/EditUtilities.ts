/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DetachedSequenceId, NodeId, TraitLabel, UuidString } from '../Identifiers';
import { TreeView, TransactionView, TreeViewPlace, TreeViewRange } from '../TreeView';
import { assert, assertNotUndefined, fail } from '../Common';
import { BuildNode, Payload, TraitLocation, TreeNodeSequence } from '../generic';
import { ChangeInternal, StablePlace, StableRange } from './PersistedTypes';

/**
 * The type of a Change
 * @public
 */
export enum ChangeType {
	Insert,
	Detach,
	Build,
	SetValue,
	Constraint,
}

/**
 * A change that composes an Edit.
 *
 * `Change` objects can be conveniently constructed with the helper methods exported on a constant of the same name.
 * @example
 * TreeChange.insert(sourceId, destination)
 * @public
 */
export type Change = Insert | Detach | Build | SetValue | Constraint;

/**
 * Constructs a sequence of nodes, associates it with the supplied ID, and stores it for use in later changes.
 * Does not modify the document.
 *
 * Valid if (transitively) all DetachedSequenceId are used according to their rules (use here counts as a destination),
 * and all Nodes' identifiers are previously unused.
 *
 * TODO: Design Decision:
 * If allowing 'moving from nowhere' to restore nodes: all new Nodes must have never before used identifiers.
 * Otherwise could just forbid identifiers currently reachable?
 * Could also allow introducing a node with a particular identifier to mean replacing that node with the new one
 * (could include optional constraint to require/prevent this).
 *
 * @public
 */
export interface Build {
	readonly destination: DetachedSequenceId;
	readonly source: TreeNodeSequence<BuildNode>;
	readonly type: typeof ChangeType.Build;
}

/**
 * Inserts a sequence of nodes at the specified destination.
 * The source can be constructed either by a Build (used to insert new nodes) or a Detach (amounts to a "move" operation).
 * @public
 */
export interface Insert {
	readonly destination: StablePlace;
	readonly source: DetachedSequenceId;
	readonly type: typeof ChangeType.Insert;
}

/**
 * Removes a sequence of nodes from the tree.
 * If a destination is specified, the detached sequence is associated with that ID and held for possible reuse
 * by later changes in this same Edit (such as by an Insert).
 * A Detach without a destination is a deletion of the specified sequence, as is a Detach with a destination that is not used later.
 * @public
 */
export interface Detach {
	readonly destination?: DetachedSequenceId;
	readonly source: StableRange;
	readonly type: typeof ChangeType.Detach;
}

/**
 * Modifies the payload of a node.
 * @public
 */
export interface SetValue {
	readonly nodeToModify: NodeId;
	/**
	 * Sets or clears the payload.
	 * To improve ease of forwards compatibility, an explicit `null` value is used to represent the clearing of a payload.
	 * SetValue may use `undefined` in future API versions to mean "don't change the payload" (which is useful if e.g. other
	 * fields are added to SetValue that can be changed without altering the payload)
	 */
	readonly payload: Payload | null;
	readonly type: typeof ChangeType.SetValue;
}

/**
 * A set of constraints on the validity of an Edit.
 * A Constraint is used to detect when an Edit, due to other concurrent edits, may have unintended effects or merge in
 * non-semantic ways. It is processed in order like any other Change in an Edit. It can cause an edit to fail if the
 * various constraints are not met at the time of evaluation (ex: the parentNode has changed due to concurrent editing).
 * Does not modify the document.
 * @public
 */
export interface Constraint {
	/**
	 * Selects a sequence of nodes which will be checked against the constraints specified by the optional fields.
	 * If `toConstrain` is invalid, it will be treated like a constraint being unmet.
	 * Depending on `effect` this may or may not make the Edit invalid.
	 *
	 * When a constraint is not met, the effects is specified by `effect`.
	 */
	readonly toConstrain: StableRange;

	/**
	 * Require that the identities of all the nodes in toConstrain hash to this value.
	 * Hash is order dependent.
	 * TODO: implement and specify exact hash function.
	 *
	 * This is an efficient (O(1) space) way to constrain a sequence of nodes to have specific identities.
	 */
	readonly identityHash?: UuidString;

	/**
	 * Require that the number of nodes in toConstrain is this value.
	 */
	readonly length?: number;

	/**
	 * Require that the contents of all of the nodes in toConstrain hash to this value.
	 * Hash is an order dependant deep hash, which includes all subtree content recursively.
	 * TODO: implement and specify exact hash function.
	 *
	 * This is an efficient (O(1) space) way to constrain a sequence of nodes have exact values (transitively).
	 */
	readonly contentHash?: UuidString;

	/**
	 * Require that parent under which toConstrain is located has this identifier.
	 */
	readonly parentNode?: NodeId;

	/**
	 * Require that the trait under which toConstrain is located has this label.
	 */
	readonly label?: TraitLabel;

	/**
	 * What to do if a constraint is not met.
	 */
	readonly effect: ConstraintEffect;

	/**
	 * Marker for which kind of Change this is.
	 */
	readonly type: typeof ChangeType.Constraint;
}

/**
 * What to do when a Constraint is violated.
 * @public
 */
export enum ConstraintEffect {
	/**
	 * Discard Edit.
	 */
	InvalidAndDiscard,

	/**
	 * Discard Edit, but record metadata that application may want to try and recover this change by recreating it.
	 * Should this be the default policy for when another (non Constraint) change is invalid?
	 */
	InvalidRetry,

	/**
	 * Apply the change, but flag it for possible reconsideration by the app
	 * (applying it is better than not, but perhaps the high level logic could produce something better).
	 */
	ValidRetry,
}

// Note: Documentation of this constant is merged with documentation of the `Change` interface.
/**
 * @public
 */
export const Change = {
	build: (source: TreeNodeSequence<BuildNode>, destination: DetachedSequenceId): Build => ({
		destination,
		source,
		type: ChangeType.Build,
	}),

	insert: (source: DetachedSequenceId, destination: StablePlace): Insert => ({
		destination,
		source,
		type: ChangeType.Insert,
	}),

	detach: (source: StableRange, destination?: DetachedSequenceId): Detach => ({
		destination,
		source,
		type: ChangeType.Detach,
	}),

	setPayload: (nodeToModify: NodeId, payload: Payload): SetValue => ({
		nodeToModify,
		payload,
		type: ChangeType.SetValue,
	}),

	clearPayload: (nodeToModify: NodeId): SetValue => ({
		nodeToModify,
		// Rationale: 'undefined' is reserved for future use (see 'SetValue' interface above.)
		// eslint-disable-next-line no-null/no-null
		payload: null,
		type: ChangeType.SetValue,
	}),

	constraint: (
		toConstrain: StableRange,
		effect: ConstraintEffect,
		identityHash?: UuidString,
		length?: number,
		contentHash?: UuidString,
		parentNode?: NodeId,
		label?: TraitLabel
	): Constraint => ({
		toConstrain,
		effect,
		identityHash,
		length,
		contentHash,
		parentNode,
		label,
		type: ChangeType.Constraint,
	}),
};

/**
 * Helper for creating a `Delete` edit.
 * @public
 */
export const Delete = {
	/**
	 * @returns a Change that deletes the supplied part of the tree.
	 */
	create: (stableRange: StableRange): Change => Change.detach(stableRange),
};

/**
 * Helper for creating an `Insert` edit.
 * @public
 */
export const Insert = {
	/**
	 * @returns a Change that inserts 'nodes' into the specified location in the tree.
	 */
	create: (nodes: TreeNodeSequence<BuildNode>, destination: StablePlace): Change[] => {
		const build = Change.build(nodes, 0 as DetachedSequenceId);
		return [build, Change.insert(build.destination, destination)];
	},
};

/**
 * Helper for creating a `Move` edit.
 * @public
 */
export const Move = {
	/**
	 * @returns a Change that moves the specified content to a new location in the tree.
	 */
	create: (source: StableRange, destination: StablePlace): Change[] => {
		const detach = Change.detach(source, 0 as DetachedSequenceId);
		return [detach, Change.insert(assertNotUndefined(detach.destination), destination)];
	},
};

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
export function setTraitInternal(trait: TraitLocation, nodes: TreeNodeSequence<BuildNode>): ChangeInternal[] {
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

	const { start: startPlace, end: endPlace } = rangeFromStableRange(view, range);
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

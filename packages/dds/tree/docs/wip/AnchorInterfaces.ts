/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This file describes the interfaces one might use to characterize the degrees of freedom of anchors.
 */

interface NodeAnchor {
	nodeId: NodeId;
	drilldown?: DrilldownKey[];
}

interface DrilldownKey {
	label: TraitLabel;
	index: number;
}

type PlaceAnchor = SiblingBasedPlaceAnchor | ParentBasedPlaceAnchor;

interface SiblingBasedPlaceAnchor {
	side: Side;
	sibling: NodeId;
	tiebreak: Tiebreak;
	moveRules: MovementRules;
}

interface ParentBasedPlaceAnchor {
	extremity: Extremity;
	parent: NodeAnchor;
	label: TraitLabel;
	tiebreak: Tiebreak;
}

type RangeAnchor = SetLikeRangeAnchor | SliceLikeRangeAnchor;

interface SetLikeRangeAnchor {
	first: NodeId;
	last?: NodeId;
}

interface SliceLikeRangeAnchor {
	parent: NodeAnchor;
	trait: TraitLabel;
	start: RangeBoundary;
	end: RangeBoundary;
}

type RangeBoundary = {
	side: Side;
	sibling: NodeId;
	tiebreak: Tiebreak;
} | {
	extremity: Extremity;
	tiebreak: Tiebreak;
}

enum Extremity { Start, End }
enum Side { Before, After }
enum Tiebreak { LastToFirst, FirstToLast }
enum MovementRules { NeverMove, CommutativeMoveInTrait, CommutativeMove }

type NodeId = number;
type TraitLabel = number | string;

//------
export enum ChangeType {
	Insert,
	Detach,
	Build,
	SetValue,
	Constraint,
}
type Change = Insert | Detach | Build | SetValue | Constraint;
export interface Build {
	readonly destination: DetachedSequenceId;
	readonly source: TreeNodeSequence<BuildNode>;
	readonly type: typeof ChangeType.Build;
}
type DetachedSequenceId = number
export interface Insert {
	readonly destination: PlaceAnchor;
	readonly source: DetachedSequenceId;
	readonly type: typeof ChangeType.Insert;
}
export interface Detach {
	readonly destination?: DetachedSequenceId;
	readonly source: RangeAnchor;
	readonly type: typeof ChangeType.Detach;
}
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
export interface Constraint {
	/**
	 * Selects a sequence of nodes which will be checked against the constraints specified by the optional fields.
	 * If `toConstrain` is invalid, it will be treated like a constraint being unmet.
	 * Depending on `effect` this may or may not make the Edit invalid.
	 *
	 * When a constraint is not met, the effects is specified by `effect`.
	 */
	readonly toConstrain: RangeAnchor;

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

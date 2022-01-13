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

interface SetLikeRangeAnchor {
	first: NodeId;
	last: NodeId;
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
type MovementRules = SimpleMovementRules | CustomMovementRules
enum SimpleMovementRules { NeverMove, CommutativeMove, AlwaysMove }
interface CustomMovementRules {
	traitLabel: TraitLabels;
	traitParent: TraitParents;
	siblingStatus: NodeStatuses;
	granularity: MoveGranularity;
	commutative: boolean;
}
enum TraitLabels { Initial, Any }
enum TraitParents { Initial, Any }
enum NodeStatuses { Alive, Deleted, Any }
enum MoveGranularity { IntraEdit, InterEdit, Any }

type NodeId = number;
type TraitLabel = number;
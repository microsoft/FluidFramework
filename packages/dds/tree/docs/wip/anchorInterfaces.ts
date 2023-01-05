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
    commutativity: Commutativity;
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

type RangeBoundary =
    | {
          side: Side;
          sibling: NodeId;
          tiebreak: Tiebreak;
      }
    | {
          extremity: Extremity;
          tiebreak: Tiebreak;
      };

enum Extremity {
    Start,
    End,
}
enum Side {
    Before,
    After,
}
enum Tiebreak {
    LastToFirst,
    FirstToLast,
}
enum Commutativity {
    Full,
    MoveOnly,
    DeleteOnly,
    None,
}

type NodeId = number;
type TraitLabel = number | string;

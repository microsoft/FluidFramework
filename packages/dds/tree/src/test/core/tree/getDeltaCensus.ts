/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type DeltaDetachedNodeChanges,
	type DeltaDetachedNodeRename,
	type DeltaFieldChanges,
	type DeltaMark,
	type DeltaRoot,
	type DeltaVisitor,
	type DetachedFieldIndex,
} from "../../../core/index.js";

export enum Location {
	DetachedRoot = "DetachedRoot",
	UnderAttachedTree = "UnderAttachedTree",
	UnderDetachingTree = "UnderDetachingTree",
	UnderDetachedPriorTree = "UnderDetachedPriorTree",
	UnderDetachedBuiltTree = "UnderDetachedBuiltTree",
	UnderAttachingPriorTree = "UnderAttachingPriorTree",
	UnderAttachingBuiltTree = "UnderAttachingBuiltTree",
}

/**
 * A census of node flows between different locations in the tree.
 *
 * Each entry `census[from][to]` represents the number of nodes that moved from the `from` location to the `to` location.
 */
export type NodeFlowCensus = Record<Location, Record<Location, number>>;

export function nodeFlowCensusFromDelta(delta: DeltaRoot): NodeFlowCensus {
	const census: NodeFlowCensus = {
		[Location.DetachedRoot]: {
			[Location.DetachedRoot]: 0,
			[Location.UnderAttachedTree]: 0,
			[Location.UnderDetachingTree]: 0,
			[Location.UnderDetachedPriorTree]: 0,
			[Location.UnderDetachedBuiltTree]: 0,
			[Location.UnderAttachingPriorTree]: 0,
			[Location.UnderAttachingBuiltTree]: 0,
		},
		[Location.UnderAttachedTree]: {
			[Location.DetachedRoot]: 0,
			[Location.UnderAttachedTree]: 0,
			[Location.UnderDetachingTree]: 0,
			[Location.UnderDetachedPriorTree]: 0,
			[Location.UnderDetachedBuiltTree]: 0,
			[Location.UnderAttachingPriorTree]: 0,
			[Location.UnderAttachingBuiltTree]: 0,
		},
		[Location.UnderDetachingTree]: {
			[Location.DetachedRoot]: 0,
			[Location.UnderAttachedTree]: 0,
			[Location.UnderDetachingTree]: 0,
			[Location.UnderDetachedPriorTree]: 0,
			[Location.UnderDetachedBuiltTree]: 0,
			[Location.UnderAttachingPriorTree]: 0,
			[Location.UnderAttachingBuiltTree]: 0,
		},
		[Location.UnderDetachedPriorTree]: {
			[Location.DetachedRoot]: 0,
			[Location.UnderAttachedTree]: 0,
			[Location.UnderDetachingTree]: 0,
			[Location.UnderDetachedPriorTree]: 0,
			[Location.UnderDetachedBuiltTree]: 0,
			[Location.UnderAttachingPriorTree]: 0,
			[Location.UnderAttachingBuiltTree]: 0,
		},
		[Location.UnderDetachedBuiltTree]: {
			[Location.DetachedRoot]: 0,
			[Location.UnderAttachedTree]: 0,
			[Location.UnderDetachingTree]: 0,
			[Location.UnderDetachedPriorTree]: 0,
			[Location.UnderDetachedBuiltTree]: 0,
			[Location.UnderAttachingPriorTree]: 0,
			[Location.UnderAttachingBuiltTree]: 0,
		},
		[Location.UnderAttachingPriorTree]: {
			[Location.DetachedRoot]: 0,
			[Location.UnderAttachedTree]: 0,
			[Location.UnderDetachingTree]: 0,
			[Location.UnderDetachedPriorTree]: 0,
			[Location.UnderDetachedBuiltTree]: 0,
			[Location.UnderAttachingPriorTree]: 0,
			[Location.UnderAttachingBuiltTree]: 0,
		},
		[Location.UnderAttachingBuiltTree]: {
			[Location.DetachedRoot]: 0,
			[Location.UnderAttachedTree]: 0,
			[Location.UnderDetachingTree]: 0,
			[Location.UnderDetachedPriorTree]: 0,
			[Location.UnderDetachedBuiltTree]: 0,
			[Location.UnderAttachingPriorTree]: 0,
			[Location.UnderAttachingBuiltTree]: 0,
		},
	};

	return census;
}

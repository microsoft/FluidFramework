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
} from "../core/index.js";

export enum TreeLocation {
	DetachedBuiltRoot = "DetachedBuiltRoot",
	DetachedPriorRoot = "DetachedPriorRoot",
	UnderAttachedTree = "UnderAttachedTree",
	UnderDetachingTree = "UnderDetachingTree",
	UnderTransientTree = "UnderTransientTree",
	UnderDetachedPriorTree = "UnderDetachedPriorTree",
	UnderAttachingPriorTree = "UnderAttachingPriorTree",
	UnderAttachingBuiltTree = "UnderAttachingBuiltTree",
}

export const allTreeLocations = [
	TreeLocation.DetachedBuiltRoot,
	TreeLocation.DetachedPriorRoot,
	TreeLocation.UnderAttachedTree,
	TreeLocation.UnderDetachingTree,
	TreeLocation.UnderDetachedPriorTree,
	TreeLocation.UnderTransientTree,
	TreeLocation.UnderAttachingPriorTree,
	TreeLocation.UnderAttachingBuiltTree,
] as const;

/**
 * A census of node flows between different locations in the tree.
 *
 * Each entry `census[from][to]` represents the number of nodes that moved from the `from` location to the `to` location.
 */
export type NodeFlowCensus = Record<TreeLocation, Record<TreeLocation, number>>;

export function makeEmptyCensus(): NodeFlowCensus {
	const census: Partial<NodeFlowCensus> = {};
	for (const from of allTreeLocations) {
		const inner: Partial<Record<TreeLocation, number>> = {};
		for (const to of allTreeLocations) {
			inner[to] = 0;
		}
		census[from] = inner as Record<TreeLocation, number>;
	}
	return census as NodeFlowCensus;
}

export function nodeFlowCensusFromDelta(delta: DeltaRoot): NodeFlowCensus {
	const census: NodeFlowCensus = makeEmptyCensus();
	return census;
}

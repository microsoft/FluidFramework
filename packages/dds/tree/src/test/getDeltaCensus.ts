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

/**
 * A type of location for a node to be in either before or after a change.
 */
export enum NodeFlowEndpoint {
	/**
	 * In a detached field (i.e., not under the document root field).
	 * Used for newly built nodes only.
	 */
	DetachedBuiltRoot = "DetachedBuiltRoot",

	/**
	 * In a detached field (i.e., not under the document root field).
	 * Used for already existing nodes only.
	 */
	DetachedPriorRoot = "DetachedPriorRoot",

	/**
	 * Either directly in the document root field,
	 * or in a field under an already existing parent that both...
	 * - is transitively under the document root field before the change
	 * - is transitively under the document root field after the change
	 */
	UnderAttachedPriorTree = "UnderAttachedPriorTree",

	/**
	 * In a field under an already existing parent that both...
	 * - is transitively under the document root field before the change
	 * - is transitively under a detached field after the change
	 */
	UnderDetachingPriorTree = "UnderDetachingPriorTree",

	/**
	 * In a field under a newly built parent that both...
	 * - is transitively under a detached field before the change
	 * - is transitively under a detached field after the change
	 */
	UnderTransientBuiltTree = "UnderTransientBuiltTree",

	/**
	 * In a field under an already existing parent that both...
	 * - is transitively under a detached field before the change
	 * - is transitively under a detached field after the change
	 */
	UnderDetachedPriorTree = "UnderDetachedPriorTree",

	/**
	 * In a field under a newly built parent that both...
	 * - is transitively under a detached field before the change
	 * - is transitively under the document root field after the change
	 */
	UnderAttachingBuiltTree = "UnderAttachingBuiltTree",

	/**
	 * In a field under an already existing parent that both...
	 * - is transitively under a detached field before the change
	 * - is transitively under the document root field after the change
	 */
	UnderAttachingPriorTree = "UnderAttachingPriorTree",
}

export const allEndpoints = [
	NodeFlowEndpoint.DetachedBuiltRoot,
	NodeFlowEndpoint.DetachedPriorRoot,
	NodeFlowEndpoint.UnderAttachedPriorTree,
	NodeFlowEndpoint.UnderDetachingPriorTree,
	NodeFlowEndpoint.UnderTransientBuiltTree,
	NodeFlowEndpoint.UnderDetachedPriorTree,
	NodeFlowEndpoint.UnderAttachingBuiltTree,
	NodeFlowEndpoint.UnderAttachingPriorTree,
] as const;

/**
 * A census of node flows between different locations in the tree.
 *
 * Each entry `census[from][to]` represents the number of nodes that moved from the `from` location to the `to` location.
 */
export type NodeFlowCensus = Record<NodeFlowEndpoint, Record<NodeFlowEndpoint, number>>;

export function makeEmptyCensus(): NodeFlowCensus {
	const census: Partial<NodeFlowCensus> = {};
	for (const from of allEndpoints) {
		const inner: Partial<Record<NodeFlowEndpoint, number>> = {};
		for (const to of allEndpoints) {
			inner[to] = 0;
		}
		census[from] = inner as Record<NodeFlowEndpoint, number>;
	}
	return census as NodeFlowCensus;
}

export function nodeFlowCensusFromDelta(delta: DeltaRoot): NodeFlowCensus {
	const census: NodeFlowCensus = makeEmptyCensus();
	return census;
}

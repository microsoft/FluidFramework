/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
	UnderDetachedBuiltTree = "UnderDetachedBuiltTree",

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

/** All possible endpoints in a {@link NodeFlowCensus} */
export const allEndpoints = [
	NodeFlowEndpoint.DetachedBuiltRoot,
	NodeFlowEndpoint.DetachedPriorRoot,
	NodeFlowEndpoint.UnderAttachedPriorTree,
	NodeFlowEndpoint.UnderDetachingPriorTree,
	NodeFlowEndpoint.UnderDetachedBuiltTree,
	NodeFlowEndpoint.UnderDetachedPriorTree,
	NodeFlowEndpoint.UnderAttachingBuiltTree,
	NodeFlowEndpoint.UnderAttachingPriorTree,
] as const;

/**
 * A census of node flows between different locations in the tree.
 * Each entry `census[from][to]` represents the number of nodes that flowed from `from` to `to` during a change.
 * In order to be counted, a node must be either built, renamed, attached, or detached during the change.
 *
 * @remarks
 * Note that the following combinations of `from` and `to` are impossible, and should always have a count of 0:
 * - Any source endpoint with "Built" in its name cannot end up as NodeFlowEndpoint.DetachedPriorRoot.
 * - Any source endpoint with "Prior" in its name cannot end up as NodeFlowEndpoint.DetachedBuiltRoot.
 */
export type NodeFlowCensus = Record<NodeFlowEndpoint, Record<NodeFlowEndpoint, number>>;

/**
 * Determines whether a flow from one node endpoint to another is possible.
 *
 * @param from - The source node endpoint.
 * @param to - The destination node endpoint.
 * @returns `true` if the flow is possible, `false` otherwise.
 */
export function isPossibleFlow(from: NodeFlowEndpoint, to: NodeFlowEndpoint): boolean {
	if (from.includes("Built") && to === NodeFlowEndpoint.DetachedPriorRoot) {
		return false;
	}
	if (from.includes("Prior") && to === NodeFlowEndpoint.DetachedBuiltRoot) {
		return false;
	}
	return true;
}

/**
 * Generates a {@link NodeFlowCensus} with all counts initialized to 0.
 */
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

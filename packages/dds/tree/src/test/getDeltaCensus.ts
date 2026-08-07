/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	offsetDetachId,
	subtractDetachedNodeId,
	type DeltaDetachedNodeId,
	type DeltaFieldChanges,
	type DeltaFieldMap,
	type DeltaMark,
	type DeltaRoot,
} from "../core/index.js";
import { RangeMap } from "../util/index.js";

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
 * Each entry `census[from][to]` represents the number of nodes that flowed from `from` to `to` during a change.
 * In order to be counted, a node must be either built, renamed, attached, or detached during the change.
 *
 * @remarks
 * Note that the following combinations of `from` and `to` are impossible, and should always have a count of 0:
 * - Any source endpoint with "Built" in its name cannot end up as NodeFlowEndpoint.DetachedPriorRoot.
 * - Any source endpoint with "Prior" in its name cannot end up as NodeFlowEndpoint.DetachedBuiltRoot.
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

/**
 * Generates a census of node flows from a given delta.
 *
 * @param delta - The delta representing changes in the tree.
 * @returns A NodeFlowCensus representing the number of nodes that flowed between different kinds of endpoints.
 */
export function nodeFlowCensusFromDelta(delta: DeltaRoot): NodeFlowCensus {
	type NodeId = `${string}:${number}-${string}:${number}`;
	type Ancestor = "doc" | "detached" | NodeId;
	const allNodes: Set<NodeId> = new Set();

	const oldToNewId = new RangeMap(offsetDetachId, subtractDetachedNodeId, offsetDetachId);
	const newToOldId = new RangeMap(offsetDetachId, subtractDetachedNodeId, offsetDetachId);
	for (const { count, oldId, newId } of delta.rename ?? []) {
		oldToNewId.set(oldId, count, newId);
		newToOldId.set(newId, count, oldId);
		for (let i = 0; i < count; i += 1) {
			allNodes.add(nodeIdFromDeltaIds(offsetDetachId(oldId, i), offsetDetachId(newId, i)));
		}
	}

	function nodeIdFromOldId(oldId: DeltaDetachedNodeId): NodeId {
		const newId = oldToNewId.getFirst(oldId, 1).value ?? oldId;
		return nodeIdFromDeltaIds(oldId, newId);
	}

	function nodeIdFromNewId(newId: DeltaDetachedNodeId): NodeId {
		const oldId = newToOldId.getFirst(newId, 1).value ?? newId;
		return nodeIdFromDeltaIds(oldId, newId);
	}

	function nodeIdFromDeltaIds(oldId: DeltaDetachedNodeId, newId: DeltaDetachedNodeId): NodeId {
		return `${oldId.major}:${oldId.minor}-${newId.major}:${newId.minor}`;
	}

	const detachSource: Map<NodeId, Ancestor> = new Map();
	function recordDetachAncestry(
		id: DeltaDetachedNodeId,
		count: number,
		ancestor: Ancestor,
	): void {
		for (let i = 0; i < count; i += 1) {
			const nodeId = nodeIdFromOldId(offsetDetachId(id, i));
			allNodes.add(nodeId);
			detachSource.set(nodeId, ancestor);
		}
	}

	const attachDestination: Map<NodeId, Ancestor> = new Map();
	function recordAttachAncestry(
		id: DeltaDetachedNodeId,
		count: number,
		ancestor: Ancestor,
	): void {
		for (let i = 0; i < count; i += 1) {
			const nodeId = nodeIdFromNewId(offsetDetachId(id, i));
			allNodes.add(nodeId);
			attachDestination.set(nodeId, ancestor);
		}
	}

	function processFieldMap(map: DeltaFieldMap | undefined, ancestor: Ancestor): void {
		if (map === undefined) {
			return;
		}
		for (const [_key, fieldChanges] of map) {
			processFieldChanges(fieldChanges, ancestor);
		}
	}

	function processFieldChanges({ marks }: DeltaFieldChanges, ancestor: Ancestor): void {
		for (const mark of marks) {
			processMark(mark, ancestor);
		}
	}

	function processMark(
		{ count, attach, detach, fields }: DeltaMark,
		ancestor: Ancestor,
	): void {
		if (detach === undefined) {
			processFieldMap(fields, ancestor);
		} else {
			recordDetachAncestry(detach, count, ancestor);
			const id = nodeIdFromOldId(detach);
			processFieldMap(fields, id);
		}

		if (attach !== undefined) {
			recordAttachAncestry(attach, count, ancestor);
		}
	}

	processFieldMap(delta.fields, "doc");

	for (const { id, fields } of delta.global ?? []) {
		recordDetachAncestry(id, 1, "detached");
		processFieldMap(fields, nodeIdFromOldId(id));
	}

	const builds: Set<NodeId> = new Set();
	for (const { id, trees } of delta.build ?? []) {
		for (let i = 0; i < trees.topLevelLength; i += 1) {
			const nodeId = nodeIdFromOldId(offsetDetachId(id, i));
			allNodes.add(nodeId);
			builds.add(nodeId);
		}
	}

	function isBuilt(id: NodeId): boolean {
		if (builds.has(id)) {
			return true;
		}
		const sourceParent = detachSource.get(id);
		if (sourceParent === undefined || sourceParent === "detached" || sourceParent === "doc") {
			return false;
		}
		return isBuilt(sourceParent);
	}

	function detachedEndpointForRoot(
		id: NodeId,
	): NodeFlowEndpoint.DetachedBuiltRoot | NodeFlowEndpoint.DetachedPriorRoot {
		return isBuilt(id)
			? NodeFlowEndpoint.DetachedBuiltRoot
			: NodeFlowEndpoint.DetachedPriorRoot;
	}

	function doesAncestorStartInDoc(parent: Ancestor): boolean {
		if (parent === "doc") {
			return true;
		}
		if (parent === "detached") {
			return false;
		}
		const source = detachSource.get(parent);
		if (source === undefined) {
			return false;
		}
		return doesAncestorStartInDoc(source);
	}

	function doesAncestorEndInDoc(parent: Ancestor): boolean {
		if (parent === "doc") {
			return true;
		}
		if (parent === "detached") {
			return false;
		}
		const source = attachDestination.get(parent);
		if (source === undefined) {
			return false;
		}
		return doesAncestorEndInDoc(source);
	}

	function endpointFromParent(parent: Ancestor): NodeFlowEndpoint {
		const startsInDoc = doesAncestorStartInDoc(parent);
		const endsInDoc = doesAncestorEndInDoc(parent);
		const built = parent === "detached" || parent === "doc" ? false : isBuilt(parent);
		const endpoint = startsInDoc
			? endsInDoc
				? NodeFlowEndpoint.UnderAttachedPriorTree
				: NodeFlowEndpoint.UnderDetachingPriorTree
			: endsInDoc
				? built
					? NodeFlowEndpoint.UnderAttachingBuiltTree
					: NodeFlowEndpoint.UnderAttachingPriorTree
				: built
					? NodeFlowEndpoint.UnderTransientBuiltTree
					: NodeFlowEndpoint.UnderDetachedPriorTree;
		return endpoint;
	}

	function startEndpoint(id: NodeId): NodeFlowEndpoint {
		const source = detachSource.get(id);
		if (source === undefined || source === "detached") {
			return detachedEndpointForRoot(id);
		}
		if (source === "doc") {
			return NodeFlowEndpoint.UnderAttachedPriorTree;
		}
		return endpointFromParent(source);
	}

	function endEndpoint(id: NodeId): NodeFlowEndpoint {
		const destination = attachDestination.get(id);
		if (destination === undefined || destination === "detached") {
			return detachedEndpointForRoot(id);
		}
		if (destination === "doc") {
			return NodeFlowEndpoint.UnderAttachedPriorTree;
		}
		return endpointFromParent(destination);
	}

	const census: NodeFlowCensus = makeEmptyCensus();
	for (const id of allNodes) {
		const from = startEndpoint(id);
		const to = endEndpoint(id);
		census[from][to] += 1;
	}

	// const newNameFromOld: Map<NodeId, NodeId> = new Map();
	// const oldNameFromNew: Map<NodeId, NodeId> = new Map();
	// for (const { count, oldId, newId } of delta.rename ?? []) {
	// 	for (let i = 0; i < count; i += 1) {
	// 		const oldNodeId = nodeIdFromOldId(offsetDetachId(oldId, i));
	// 		const newNodeId = nodeIdFromNewId(offsetDetachId(newId, i));

	// 		const source = detachSource.get(oldNodeId);
	// 		const destination = attachDestination.get(newNodeId);

	// 		if (source === undefined && destination === undefined) {
	// 			// Count the roots that are neither detached or attached but just renamed
	// 			const builtOrPrior = detachedEndpointForRoot(oldNodeId);
	// 			census[builtOrPrior][builtOrPrior] += 1;
	// 		} else {
	// 			const sourceEndpoint =
	// 				source === undefined ? detachedEndpointForRoot(oldNodeId) : startsInDoc(source);
	// 		}

	// 		newNameFromOld.set(oldNodeId, newNodeId);
	// 		oldNameFromNew.set(newNodeId, oldNodeId);
	// 	}
	// }

	return census;
}

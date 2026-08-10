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
import { makeEmptyCensus, NodeFlowCensus, NodeFlowEndpoint } from "./nodeFlowCensus.js";

/**
 * Generates a census of node flows from a given delta.
 *
 * @param delta - The delta to produce the census from.
 * @returns A NodeFlowCensus representing the number of nodes that flow between different kinds of endpoints in the given `delta`.
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
					? NodeFlowEndpoint.UnderDetachedBuiltTree
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
	return census;
}

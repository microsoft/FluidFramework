/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryGenericEvent } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
	gcBlobPrefix,
	gcDeletedBlobKey,
	gcTombstoneBlobKey,
	IGarbageCollectionData,
	IGarbageCollectionDetailsBase,
} from "@fluidframework/runtime-definitions";
import { packagePathToTelemetryProperty } from "@fluidframework/runtime-utils";
import { MonitoringContext } from "@fluidframework/telemetry-utils";
import {
	disableTombstoneKey,
	GCFeatureMatrix,
	GCVersion,
	IGCMetadata,
	runSweepKey,
	throwOnTombstoneLoadKey,
	throwOnTombstoneUsageKey,
} from "./gcDefinitions";
import {
	IGarbageCollectionNodeData,
	IGarbageCollectionSnapshotData,
	IGarbageCollectionState,
} from "./gcSummaryDefinitions";

export function getGCVersion(metadata?: IGCMetadata): GCVersion {
	if (!metadata) {
		// Force to 0/disallowed in prior versions
		return 0;
	}
	return metadata.gcFeature ?? 0;
}

/**
 * Consolidates info / logic for logging when we encounter unexpected usage of GC'd objects. For example, when a
 * tombstoned or deleted object is loaded.
 */
export function sendGCUnexpectedUsageEvent(
	mc: MonitoringContext,
	event: ITelemetryGenericEvent & {
		category: "error" | "generic";
		gcTombstoneEnforcementAllowed: boolean | undefined;
	},
	packagePath: readonly string[] | undefined,
	error?: unknown,
) {
	event.pkg = packagePathToTelemetryProperty(packagePath);
	event.tombstoneFlags = JSON.stringify({
		DisableTombstone: mc.config.getBoolean(disableTombstoneKey),
		ThrowOnTombstoneUsage: mc.config.getBoolean(throwOnTombstoneUsageKey),
		ThrowOnTombstoneLoad: mc.config.getBoolean(throwOnTombstoneLoadKey),
	});
	event.sweepFlags = JSON.stringify({
		EnableSweepFlag: mc.config.getBoolean(runSweepKey),
	});

	mc.logger.sendTelemetryEvent(event, error);
}

/**
 * Indicates whether Tombstone Enforcement is allowed for this document based on the current/persisted
 * TombstoneGeneration values
 *
 * In order to protect old documents that were created at a time when known bugs exist that violate GC's invariants
 * such that enforcing GC Tombstone (Failing on Tombstone load/usage) would cause legitimate data loss,
 * the container author may increment the generation value for Tombstone such that containers created
 * with a different value will not be subjected to GC enforcement.
 *
 * If no generation is provided at runtime, this defaults to return true to maintain expected default behavior
 *
 * @param persistedGeneration - The persisted tombstoneGeneration value
 * @param currentGeneration - The current app-provided tombstoneGeneration value
 * @returns true if GC Tombstone enforcement (Fail on Tombstone load/usage) should be allowed for this document
 */
export function shouldAllowGcTombstoneEnforcement(
	persistedGeneration: number | undefined,
	currentGeneration: number | undefined,
): boolean {
	// If no Generation value is provided for this session, then we should default to letting Tombstone feature behave as intended.
	if (currentGeneration === undefined) {
		return true;
	}
	return persistedGeneration === currentGeneration;
}

/**
 * Indicates whether Sweep is allowed for this document based on the GC Feature Matrix and current SweepGeneration
 *
 * In order to protect old documents that were created at a time when known bugs exist that violate GC's invariants
 * such that enforcing GC Sweep would cause legitimate data loss, the container author may increment the generation value for Sweep
 * such that containers created with a different value will not be subjected to GC Sweep.
 *
 * If no generation is provided, Sweep will be disabled.
 * Passing 0 is a special case: Sweep will be enabled for any document with gcSweepGeneration OR gcTombstoneGeneration as 0.
 *
 * @param persistedGenerations - The persisted sweep/tombstone generations from the GC Feature Matrix
 * @param currentGeneration - The current app-provided sweepGeneration value
 * @returns true if GC Sweep should be allowed for this document
 */
export function shouldAllowGcSweep(
	persistedGenerations: Pick<GCFeatureMatrix, "sweepGeneration" | "tombstoneGeneration">,
	currentGeneration: number | undefined,
): boolean {
	// If no Generation value is provided for this session, default to false
	if (currentGeneration === undefined) {
		return false;
	}

	// 0 is a special case: It matches both SweepGeneration and TombstoneGeneration
	// This is an optimistic measure to maximize coverage of GC Sweep if no bumps to TombstoneGeneration are needed before enabling Sweep.
	if (currentGeneration === 0) {
		return (
			persistedGenerations.sweepGeneration === 0 ||
			persistedGenerations.tombstoneGeneration === 0
		);
	}

	return persistedGenerations.sweepGeneration === currentGeneration;
}

/**
 * Sorts the given GC state as per the id of the GC nodes. It also sorts the outbound routes array of each node.
 */
export function generateSortedGCState(gcState: IGarbageCollectionState): IGarbageCollectionState {
	const sortableArray: [string, IGarbageCollectionNodeData][] = Object.entries(gcState.gcNodes);
	sortableArray.sort(([a], [b]) => a.localeCompare(b));
	const sortedGCState: IGarbageCollectionState = { gcNodes: {} };
	for (const [nodeId, nodeData] of sortableArray) {
		nodeData.outboundRoutes.sort();
		sortedGCState.gcNodes[nodeId] = nodeData;
	}
	return sortedGCState;
}

/**
 * Concatenates the given GC states and returns the concatenated GC state.
 */
export function concatGarbageCollectionStates(
	gcState1: IGarbageCollectionState,
	gcState2: IGarbageCollectionState,
): IGarbageCollectionState {
	const combinedGCNodes: { [id: string]: IGarbageCollectionNodeData } = {};
	for (const [nodeId, nodeData] of Object.entries(gcState1.gcNodes)) {
		combinedGCNodes[nodeId] = {
			outboundRoutes: Array.from(nodeData.outboundRoutes),
			unreferencedTimestampMs: nodeData.unreferencedTimestampMs,
		};
	}

	for (const [nodeId, nodeData] of Object.entries(gcState2.gcNodes)) {
		let combineNodeData = combinedGCNodes[nodeId];
		if (combineNodeData === undefined) {
			combineNodeData = {
				outboundRoutes: Array.from(nodeData.outboundRoutes),
				unreferencedTimestampMs: nodeData.unreferencedTimestampMs,
			};
		} else {
			// Validate that same node doesn't have different unreferenced timestamp.
			if (
				nodeData.unreferencedTimestampMs !== undefined &&
				combineNodeData.unreferencedTimestampMs !== undefined
			) {
				assert(
					nodeData.unreferencedTimestampMs === combineNodeData.unreferencedTimestampMs,
					"Two entries for the same GC node with different unreferenced timestamp",
				);
			}
			combineNodeData = {
				outboundRoutes: [
					...new Set([...nodeData.outboundRoutes, ...combineNodeData.outboundRoutes]),
				],
				unreferencedTimestampMs:
					nodeData.unreferencedTimestampMs ?? combineNodeData.unreferencedTimestampMs,
			};
		}
		combinedGCNodes[nodeId] = combineNodeData;
	}
	return { gcNodes: combinedGCNodes };
}

/**
 * Helper function that clones the GC data.
 * @param gcData - The GC data to clone.
 * @returns a clone of the given GC data.
 */
export function cloneGCData(gcData: IGarbageCollectionData): IGarbageCollectionData {
	const clonedGCNodes: { [id: string]: string[] } = {};
	for (const [id, outboundRoutes] of Object.entries(gcData.gcNodes)) {
		clonedGCNodes[id] = Array.from(outboundRoutes);
	}
	return {
		gcNodes: clonedGCNodes,
	};
}

/**
 * Concatenates the given GC data and returns the concatenated GC data.
 */
export function concatGarbageCollectionData(
	gcData1: IGarbageCollectionData,
	gcData2: IGarbageCollectionData,
) {
	const combinedGCData: IGarbageCollectionData = cloneGCData(gcData1);
	for (const [id, routes] of Object.entries(gcData2.gcNodes)) {
		if (combinedGCData.gcNodes[id] === undefined) {
			combinedGCData.gcNodes[id] = Array.from(routes);
		} else {
			const combinedRoutes = [...routes, ...combinedGCData.gcNodes[id]];
			combinedGCData.gcNodes[id] = [...new Set(combinedRoutes)];
		}
	}
	return combinedGCData;
}

/**
 * Gets the base garbage collection state from the given snapshot tree. It contains GC state, deleted nodes and
 * tombstones. The GC state may be written into multiple blobs. Merge the GC state from all such blobs into one.
 */
export async function getGCDataFromSnapshot(
	gcSnapshotTree: ISnapshotTree,
	readAndParseBlob: <T>(id: string) => Promise<T>,
): Promise<IGarbageCollectionSnapshotData> {
	let rootGCState: IGarbageCollectionState = { gcNodes: {} };
	let tombstones: string[] | undefined;
	let deletedNodes: string[] | undefined;
	for (const key of Object.keys(gcSnapshotTree.blobs)) {
		// Update deleted nodes blob.
		if (key === gcDeletedBlobKey) {
			deletedNodes = await readAndParseBlob<string[]>(gcSnapshotTree.blobs[key]);
			continue;
		}

		// Update tombstone blob.
		if (key === gcTombstoneBlobKey) {
			tombstones = await readAndParseBlob<string[]>(gcSnapshotTree.blobs[key]);
			continue;
		}

		// Skip blobs that do not start with the GC prefix.
		if (!key.startsWith(gcBlobPrefix)) {
			continue;
		}

		const blobId = gcSnapshotTree.blobs[key];
		if (blobId === undefined) {
			continue;
		}
		const gcState = await readAndParseBlob<IGarbageCollectionState>(blobId);
		assert(gcState !== undefined, "GC blob missing from snapshot");
		// Merge the GC state of this blob into the root GC state.
		rootGCState = concatGarbageCollectionStates(rootGCState, gcState);
	}
	return { gcState: rootGCState, tombstones, deletedNodes };
}

/**
 * Helper function that unpacks the GC details of the children from a given node's GC details.
 * @param gcDetails - The GC details of a node.
 * @returns A map of GC details of each children of the the given node.
 */
export function unpackChildNodesGCDetails(gcDetails: IGarbageCollectionDetailsBase) {
	const childGCDetailsMap: Map<string, IGarbageCollectionDetailsBase> = new Map();

	// If GC data is not available, bail out.
	if (gcDetails.gcData === undefined) {
		return childGCDetailsMap;
	}

	const gcNodes = gcDetails.gcData.gcNodes;
	for (const [id, outboundRoutes] of Object.entries(gcNodes)) {
		// Skip self-node since only children GC data is to be generated.
		if (id === "/") {
			continue;
		}

		assert(id.startsWith("/"), "node id should always be an absolute route");
		const childId = id.split("/")[1];
		let childGCNodeId = id.slice(childId.length + 1);
		// GC node id always begins with "/". Handle the special case where a child's id in the parent's GC nodes is
		// of format `/root`. In this case, the childId is root and childGCNodeId is "". Make childGCNodeId = "/".
		if (childGCNodeId === "") {
			childGCNodeId = "/";
		}

		let childGCDetails = childGCDetailsMap.get(childId);
		if (childGCDetails === undefined) {
			childGCDetails = { gcData: { gcNodes: {} }, usedRoutes: [] };
		}
		// gcData should not undefined as its always at least initialized as  empty above.
		assert(childGCDetails.gcData !== undefined, "Child GC data should have been initialized");
		childGCDetails.gcData.gcNodes[childGCNodeId] = [...new Set(outboundRoutes)];
		childGCDetailsMap.set(childId, childGCDetails);
	}

	if (gcDetails.usedRoutes === undefined) {
		return childGCDetailsMap;
	}

	// Remove the node's self used route, if any, and generate the children used routes.
	const usedRoutes = gcDetails.usedRoutes.filter((route) => route !== "" && route !== "/");
	for (const route of usedRoutes) {
		assert(route.startsWith("/"), "Used route should always be an absolute route");
		const childId = route.split("/")[1];
		const childUsedRoute = route.slice(childId.length + 1);

		const childGCDetails = childGCDetailsMap.get(childId);
		assert(
			childGCDetails?.usedRoutes !== undefined,
			"This should have be initialized when generate GC nodes above",
		);

		childGCDetails.usedRoutes.push(childUsedRoute);
		childGCDetailsMap.set(childId, childGCDetails);
	}
	return childGCDetailsMap;
}

/**
 * Trims the leading and trailing slashes from the given string.
 * @param str - A string that may contain leading and / or trailing slashes.
 * @returns A new string without leading and trailing slashes.
 */
export function trimLeadingAndTrailingSlashes(str: string) {
	return str.replace(/^\/+|\/+$/g, "");
}

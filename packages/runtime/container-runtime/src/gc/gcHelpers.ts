/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import {
	IGarbageCollectionDetailsBase,
	gcBlobPrefix,
	gcDeletedBlobKey,
	gcTombstoneBlobKey,
	IGarbageCollectionData,
} from "@fluidframework/runtime-definitions/internal";
import type { IConfigProvider } from "@fluidframework/telemetry-utils/internal";

import {
	GCFeatureMatrix,
	GCVersion,
	IGCMetadata,
	gcVersionUpgradeToV4Key,
	nextGCVersion,
	stableGCVersion,
} from "./gcDefinitions.js";
import {
	IGarbageCollectionNodeData,
	IGarbageCollectionSnapshotData,
	IGarbageCollectionState,
} from "./gcSummaryDefinitions.js";

export function getGCVersion(metadata?: IGCMetadata): GCVersion {
	if (!metadata) {
		// Force to 0/disallowed in prior versions
		return 0;
	}
	return metadata.gcFeature ?? 0;
}

/**
 * Indicates what GC version is in effect for new GC data being written in this session
 */
export function getGCVersionInEffect(configProvider: IConfigProvider): number {
	// If version upgrade is not enabled, fall back to the stable GC version.
	return configProvider.getBoolean(gcVersionUpgradeToV4Key) === true
		? nextGCVersion
		: stableGCVersion;
}

/**
 * Indicates whether Sweep is allowed for this document based on the persisted GC Feature Matrix and current gcGeneration.
 * This applies to the entire Sweep Phase the same - both Tombstone Enforcement (i.e. should loading a Tombstone fail?) and Deletion.
 *
 * In order to protect old documents that were created at a time when known bugs exist that violate GC's invariants
 * such that enforcing GC Sweep would cause legitimate data loss, the container author may increment the generation value for Sweep
 * such that containers created with a different value will not be subjected to GC Sweep.
 *
 * If no generation is provided, Sweep will be enabled for all documents.
 *
 * For backwards compatibility, the current generation value is also compared against the persisted gcTombstoneGeneration if present.
 *
 * @param featureMatrix - The GC Feature Matrix, containing the persisted generation value
 * @param currentGeneration - The current app-provided gcGeneration value
 * @returns true if GC Sweep should be allowed for this document
 */
export function shouldAllowGcSweep(
	featureMatrix: GCFeatureMatrix,
	currentGeneration: number | undefined,
): boolean {
	// If no Generation value is provided for this session, default to true
	if (currentGeneration === undefined) {
		return true;
	}

	// tombstoneGeneration is the predecessor and needs to be supported for back-compat reasons
	const targetGeneration = featureMatrix.tombstoneGeneration ?? featureMatrix.gcGeneration;

	return currentGeneration === targetGeneration;
}

/**
 * Sorts the given GC state as per the id of the GC nodes. It also sorts the outbound routes array of each node.
 */
export function generateSortedGCState(
	gcState: IGarbageCollectionState,
): IGarbageCollectionState {
	const sortableArray: [string, IGarbageCollectionNodeData][] = Object.entries(
		gcState.gcNodes,
	);
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
					0x5d7 /* Two entries for the same GC node with different unreferenced timestamp */,
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
		assert(gcState !== undefined, 0x5d8 /* GC blob missing from snapshot */);
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

		const childId = id.split("/")[1];
		assert(
			childId !== undefined,
			0x9fe /* node id should be an absolute route with child id part */,
		);
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
		assert(
			childGCDetails.gcData !== undefined,
			0x5da /* Child GC data should have been initialized */,
		);
		childGCDetails.gcData.gcNodes[childGCNodeId] = [...new Set(outboundRoutes)];
		childGCDetailsMap.set(childId, childGCDetails);
	}

	if (gcDetails.usedRoutes === undefined) {
		return childGCDetailsMap;
	}

	// Remove the node's self used route, if any, and generate the children used routes.
	const usedRoutes = gcDetails.usedRoutes.filter((route) => route !== "" && route !== "/");
	for (const route of usedRoutes) {
		const childId = route.split("/")[1];
		assert(
			childId !== undefined,
			0x9ff /* used route should be an absolute route with child id part */,
		);
		const childUsedRoute = route.slice(childId.length + 1);

		const childGCDetails = childGCDetailsMap.get(childId);
		assert(
			childGCDetails?.usedRoutes !== undefined,
			0x5dc /* This should have be initialized when generate GC nodes above */,
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
function trimLeadingAndTrailingSlashes(str: string) {
	return str.replace(/^\/+|\/+$/g, "");
}

/**
 * Reformats a request URL to match expected format for a GC node path
 */
export function urlToGCNodePath(url: string): string {
	return `/${trimLeadingAndTrailingSlashes(url.split("?")[0])}`;
}

/**
 * Pulls out the first path segment and formats it as a GC Node path
 * e.g. "/dataStoreId/ddsId" yields "/dataStoreId"
 */
export function dataStoreNodePathOnly(subDataStorePath: string): string {
	return `/${subDataStorePath.split("/")[1]}`;
}

/**
 * Utility to implement compat behaviors given an unknown message type
 * The parameters are typed to support compile-time enforcement of handling all known types/behaviors
 *
 * @param _unknownGCMessageType - Typed as never to ensure all known types have been
 * handled before calling this function (e.g. in a switch statement).
 * @param compatBehavior - Typed redundantly with CompatModeBehavior to ensure handling is added when updating that type
 */
export function compatBehaviorAllowsGCMessageType(
	_unknownGCMessageType: never,
	compatBehavior: "Ignore" | "FailToProcess" | undefined,
): boolean {
	// undefined defaults to same behavior as "FailToProcess"
	return compatBehavior === "Ignore";
}

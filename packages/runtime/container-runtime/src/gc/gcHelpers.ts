/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryGenericEvent } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
	gcTreeKey,
	IGarbageCollectionNodeData,
	IGarbageCollectionSnapshotData,
	IGarbageCollectionState,
	IGarbageCollectionSummaryDetailsLegacy,
} from "@fluidframework/runtime-definitions";
import { packagePathToTelemetryProperty, ReadAndParseBlob } from "@fluidframework/runtime-utils";
import { MonitoringContext } from "@fluidframework/telemetry-utils";
import { getSummaryForDatastores } from "../dataStores";
import {
	dataStoreAttributesBlobName,
	IContainerRuntimeMetadata,
	ReadFluidDataStoreAttributes,
} from "../summary";
import {
	disableTombstoneKey,
	GCVersion,
	IGCMetadata,
	runSweepKey,
	throwOnTombstoneLoadKey,
	throwOnTombstoneUsageKey,
} from "./gcDefinitions";

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
 * In order to protect old documents that were created at a time when known bugs exist that violate GC's invariants
 * such that enforcing GC (Fail on Tombstone load/usage, GC Sweep) would cause legitimate data loss,
 * the container author may increment the generation value for Tombstone such that containers created
 * with a different value will not be subjected to GC enforcement.
 * If no generation is provided at runtime, this defaults to return true to maintain expected default behavior
 * @param persistedGeneration - The persisted feature support value
 * @param currentGeneration - The current app-provided feature support value
 * @returns true if GC Enforcement (Fail on Tombstone load/usage) should be allowed
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
 * Before GC data was written at the root of the summary tree, individual GC blobs were written at each data store;s
 * snapshot tree. This function consolidates them into the new IGarbageCollectionState format.
 */
export async function getSnapshotDataFromOldSnapshotFormat(
	oldSnapshot: ISnapshotTree,
	metadata: IContainerRuntimeMetadata | undefined,
	readAndParseBlob: ReadAndParseBlob,
): Promise<IGarbageCollectionSnapshotData | undefined> {
	// Add a node for the root node that is not present in older snapshot format.
	const gcState: IGarbageCollectionState = {
		gcNodes: { "/": { outboundRoutes: [] } },
	};
	const dataStoreSnapshotTree = getSummaryForDatastores(oldSnapshot, metadata);
	assert(
		dataStoreSnapshotTree !== undefined,
		0x2a8 /* "Expected data store snapshot tree in base snapshot" */,
	);
	for (const [dsId, dsSnapshotTree] of Object.entries(dataStoreSnapshotTree.trees)) {
		const blobId = dsSnapshotTree.blobs[gcTreeKey];
		if (blobId === undefined) {
			continue;
		}

		const gcSummaryDetails = await readAndParseBlob<IGarbageCollectionSummaryDetailsLegacy>(
			blobId,
		);
		// If there are no nodes for this data store, skip it.
		if (gcSummaryDetails.gcData?.gcNodes === undefined) {
			continue;
		}

		const dsRootId = `/${dsId}`;
		// Since we used to write GC data at data store level, we won't have an entry for the root ("/").
		// Construct that entry by adding root data store ids to its outbound routes.
		const initialSnapshotDetails = await readAndParseBlob<ReadFluidDataStoreAttributes>(
			dsSnapshotTree.blobs[dataStoreAttributesBlobName],
		);
		if (initialSnapshotDetails.isRootDataStore) {
			gcState.gcNodes["/"].outboundRoutes.push(dsRootId);
		}

		for (const [id, outboundRoutes] of Object.entries(gcSummaryDetails.gcData.gcNodes)) {
			// Prefix the data store id to the GC node ids to make them relative to the root from being
			// relative to the data store. Similar to how its done in DataStore::getGCData.
			const rootId = id === "/" ? dsRootId : `${dsRootId}${id}`;
			gcState.gcNodes[rootId] = {
				outboundRoutes: Array.from(outboundRoutes),
			};
		}
		assert(
			gcState.gcNodes[dsRootId] !== undefined,
			0x2a9 /* GC nodes for data store not in GC blob */,
		);
		gcState.gcNodes[dsRootId].unreferencedTimestampMs = gcSummaryDetails.unrefTimestamp;
	}
	// If there is only one node (root node just added above), either GC is disabled or we are loading from
	// the first summary generated by detached container. In both cases, GC was not run - return undefined.
	return Object.keys(gcState.gcNodes).length === 1
		? undefined
		: { gcState, tombstones: undefined, deletedNodes: undefined };
}

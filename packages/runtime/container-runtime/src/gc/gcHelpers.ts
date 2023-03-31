/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryGenericEvent } from "@fluidframework/common-definitions";
import {
	IGarbageCollectionNodeData,
	IGarbageCollectionState,
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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryGenericEvent } from "@fluidframework/common-definitions";
import { packagePathToTelemetryProperty } from "@fluidframework/runtime-utils";
import { MonitoringContext } from "@fluidframework/telemetry-utils";
import {
	disableTombstoneKey,
	runSweepKey,
	throwOnTombstoneLoadKey,
	throwOnTombstoneUsageKey,
} from "./garbageCollectionConstants";

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

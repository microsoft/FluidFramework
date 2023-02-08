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

//* Log the versions as well?

/**
 * Consolidates info / logic for logging when we encounter unexpected usage of GC'd objects. For example, when a
 * tombstoned or deleted object is loaded.
 */
export function sendGCUnexpectedUsageEvent(
	mc: MonitoringContext,
	event: ITelemetryGenericEvent & {
		category: "error" | "generic";
		isSummarizerClient: boolean;
		gcEnforcementDisabled: boolean;
	},
	packagePath: readonly string[] | undefined,
	details: { isSummarizerClient: boolean; },
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

//* Maybe flip boolean value of this to be "can run" instead of "should disable" -- "allow"

/**
 * In order to protect old documents that were created at a time when known bugs exist that violate GC's invariants
 * such that enforcing GC (Fail on Tombstone load/usage, GC Sweep) would cause legitimate data loss,
 * the container author may increment the feature support value for Tombstone such that containers created
 * with a different value will not be subjected to GC enforcement.
 * @param persistedValue - The persisted feature support value
 * @param currentValue - The current app-provided feature support value
 * @returns true if GC Enforcement (Fail on Tombstone load/usage, GC Sweep) should be disabled
 */
export function shouldDisableGcEnforcement(
	persistedValue: number | undefined,
	currentValue: number | undefined,
): boolean {
	return persistedValue !== currentValue;
}

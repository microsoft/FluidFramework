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
	event: ITelemetryGenericEvent & { category: "error" | "generic"; isSummarizerClient: boolean; gcEnforcementDisabled: boolean },
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
 * In order to protect old documents that were created at a time when known bugs exist that violate invariants GC depends on
 * such that enforcing GC (Fail on Tombstone load/usage, GC Sweep) would cause legitimate data loss,
 * the container author may pass in a min version such that containers created before this point will not be subjected
 * to GC enforcement.
 * @param createContainerRuntimeVersion - The persisted runtimeVersion that was in effect when the container was created
 * @param gcEnforcementMinCreateContainerRuntimeVersion - The app-provided min version (via an undocumented ContainerRuntimeOption)
 * @returns true if GC Enforcement (Fail on Tombstone load/usage, GC Sweep) should be disabled
 */
export function shouldDisableGcEnforcementForOldContainer(
	createContainerRuntimeVersion: string | undefined,
	gcEnforcementMinCreateContainerRuntimeVersion: string | undefined,
): boolean {
	return false;	
}

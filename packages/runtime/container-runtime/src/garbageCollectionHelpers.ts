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
	event: ITelemetryGenericEvent & { category: "error" | "generic"; isSummarizerClient: boolean },
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

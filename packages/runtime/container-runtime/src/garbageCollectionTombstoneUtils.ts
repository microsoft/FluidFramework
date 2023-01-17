/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryGenericEvent } from "@fluidframework/common-definitions";
import { packagePathToTelemetryProperty } from "@fluidframework/runtime-utils";
import { MonitoringContext } from "@fluidframework/telemetry-utils";
import { disableTombstoneKey, throwOnTombstoneLoadKey, throwOnTombstoneUsageKey } from "./garbageCollectionConstants";

/**
 * Consolidates info / logic for logging when we encounter a Tombstone
 */
export function sendGCTombstoneEvent(
    mc: MonitoringContext,
    event: ITelemetryGenericEvent & { isSummarizerClient: boolean },
    logAsError: boolean,
    packagePath: readonly string[] | undefined,
    error?: unknown,
) {
    event.category = logAsError ? "error" : "generic";
    event.pkg = packagePathToTelemetryProperty(packagePath);
    event.tombstoneFlags = JSON.stringify({
        DisableTombstone: mc.config.getBoolean(disableTombstoneKey),
        ThrowOnTombstoneUsage: mc.config.getBoolean(throwOnTombstoneUsageKey),
        ThrowOnTombstoneLoad: mc.config.getBoolean(throwOnTombstoneLoadKey),
    });

    mc.logger.sendTelemetryEvent(event, error);
}

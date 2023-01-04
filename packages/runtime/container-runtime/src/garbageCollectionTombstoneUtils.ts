/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryGenericEvent } from "@fluidframework/common-definitions";
import { packagePathToTelemetryProperty } from "@fluidframework/runtime-utils";
import { MonitoringContext } from "@fluidframework/telemetry-utils";
import { throwOnTombstoneUsageKey } from "./garbageCollectionConstants";

/**
 * Decides whether or not to send an error event or a generic event for gc tombstone scenarios
 *
 * Adds isSummarizerClient, packagePath, and error to telemetry properties.
 */
export function sendGCTombstoneEvent(
    mc: MonitoringContext,
    event: ITelemetryGenericEvent,
    isSummarizerClient: boolean,
    packagePath: readonly string[] | undefined,
    error?: any,
) {
    const throwOnTombstoneUsage = event.throwOnTombstoneUsage = mc.config.getBoolean(throwOnTombstoneUsageKey) ?? false;
    event.pkg = packagePathToTelemetryProperty(packagePath);
    event.isSummarizerClient = isSummarizerClient;
    if(throwOnTombstoneUsage) {
        mc.logger.sendErrorEvent(event, error);
    } else {
        mc.logger.sendTelemetryEvent(
            {
                ...event,
                ...error,
            }
        );
    }
}

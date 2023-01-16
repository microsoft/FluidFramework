/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryGenericEvent, ITelemetryLogger } from "@fluidframework/common-definitions";
import { packagePathToTelemetryProperty } from "@fluidframework/runtime-utils";

/**
 * Decides whether or not to send an error event or a generic event for gc tombstone scenarios
 *
 * Adds isSummarizerClient, packagePath, and error to telemetry properties.
 */
export function sendGCTombstoneEvent(
    logger: ITelemetryLogger,
    event: ITelemetryGenericEvent & { isSummarizerClient: boolean },
    logAsError: boolean,
    packagePath: readonly string[] | undefined,
    error: unknown,
) {
    event.category = logAsError ? "error" : "generic";
    event.pkg = packagePathToTelemetryProperty(packagePath);

    logger.sendTelemetryEvent(event, error);
}

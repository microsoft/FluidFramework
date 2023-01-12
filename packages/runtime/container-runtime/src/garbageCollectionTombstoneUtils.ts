/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryGenericEvent, ITelemetryLogger } from "@fluidframework/common-definitions";
import { packagePathToTelemetryProperty } from "@fluidframework/runtime-utils";

/** Augments and sends the given event/error via the given logger */
export function sendGCTombstoneEvent(
    logger: ITelemetryLogger,
    event: ITelemetryGenericEvent,
    logAsError: boolean,
    isSummarizerClient: boolean,
    packagePath: readonly string[] | undefined,
    error: unknown,
) {
    event.category = logAsError ? "error" : "generic";
    event.pkg = packagePathToTelemetryProperty(packagePath);
    event.isSummarizerClient = isSummarizerClient;

    logger.sendTelemetryEvent(event, error);
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryGenericEvent, ITelemetryLogger } from "@fluidframework/common-definitions";
import { packagePathToTelemetryProperty } from "@fluidframework/runtime-utils";

/**
 * Decides whether or not to send an error event or a generic event for gc tombstone scenarios
 *
 * @param throwOnTombstoneUsage - only send error events when throwing on tombstone usage.
 */
export function sendGCTombstoneEvent(
    logger: ITelemetryLogger,
    event: ITelemetryGenericEvent,
    throwOnTombstoneUsage: boolean,
    packagePath: readonly string[] | undefined,
    error?: any,
) {
    event.throwOnTombstoneUsage = throwOnTombstoneUsage;
    event.pkg = packagePathToTelemetryProperty(packagePath);
    if(throwOnTombstoneUsage) {
        logger.sendErrorEvent(event, error);
    } else {
        logger.sendTelemetryEvent(
            {
                ...event,
                ...error,
            }
        );
    }
}

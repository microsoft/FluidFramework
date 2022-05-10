/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    ITelemetryBaseEvent,
    ITelemetryBaseLogger,
    ITelemetryGenericEvent,
} from "@fluidframework/common-definitions";

/**
 * Like assert, but logs only if the condition is false, rather than throwing
 * @param condition - The condition to attest too
 * @param logger - The logger to log with
 * @param event - The string or event to log
 * @returns - The outcome of the condition
 */
export function logIfFalse(
    condition: any,
    logger: ITelemetryBaseLogger,
    event: string | ITelemetryGenericEvent,
): condition is true {
    if (condition) {
        return true;
    }
    const newEvent: ITelemetryBaseEvent =
        typeof event === "string"
        ? { eventName: event, category: "error" }
        : { category: "error", ...event };
    logger.send(newEvent);
    return false;
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    ITelemetryBaseEvent,
    ITelemetryBaseLogger,
    ITelemetryGenericEvent,
} from "@fluidframework/common-definitions";

/**
 * Like assert, but logs only if the condition is false, rather than throwing
 * @param logger - The logger to log with
 * @param condition - The condition to attest too
 * @param event - The string or event to log
 * @returns - The outcome of the condition
 */
export function attest(
    logger: ITelemetryBaseLogger,
    condition: any,
    event: string | ITelemetryGenericEvent,
): condition is true {
    if(condition) {
        return true;
    }
    const newEvent: ITelemetryBaseEvent =
        typeof event === "string"
        ? {eventName: event, category: "error"}
        : {category: "error", ...event };
    logger.send(newEvent);
    return false;
}

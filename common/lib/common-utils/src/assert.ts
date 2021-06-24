/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";

/**
 * A browser friendly version of the node assert library. Use this instead of the 'assert' package, which has a big
 * impact on bundle sizes.
 *
 * @param condition - The condition that should be true, if the condition is false an error will be thrown.
 * @param message - The message to include in the error when the condition does not hold.  A number should
 *                  not be specificed manually. Run policy-check to get shortcode number assigned.
 * @param logger - If provided, assertion failures will be logged as error events on the given logger.
 * @param eventName - Used to specify the name of the telemetry event logged on failure.  Default is
 *                    "InvariantViolation".
 */
export function assert(
    condition: boolean,
    message: string | number,
    logger?: ITelemetryLogger,
    eventName?: string,
): asserts condition {
    if (!condition) { fail(message, logger, eventName); }
}

export function fail(
    message: string | number,
    logger?: ITelemetryLogger,
    eventName = "InvariantViolation",
): never {
    try {
        throw new Error(
            typeof message === "number"
                ? `0x${message.toString(16).padStart(3, "0")}`
                : message);
    } catch (error) {
        logger?.sendErrorEvent({ eventName }, error);
        throw error;
    }
}

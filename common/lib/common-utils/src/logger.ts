/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ITelemetryBaseEvent,
    ITelemetryBaseLogger,
    ITelemetryErrorEvent,
    ITelemetryGenericEvent,
    ITelemetryLogger,
    ITelemetryPerformanceEvent,
} from "@fluidframework/common-definitions";

/**
 * Null logger
 * It can be used in places where logger instance is required, but events should be not send over.
 */
export class BaseTelemetryNullLogger implements ITelemetryBaseLogger {
    /**
     * Send an event with the logger
     *
     * @param event - the event to send
     */
    public send(event: ITelemetryBaseEvent): void {
        return;
    }
}

/**
 * Null logger
 * It can be used in places where logger instance is required, but events should be not send over.
 */
export class TelemetryNullLogger implements ITelemetryLogger {
    public send(event: ITelemetryBaseEvent): void {
    }
    public sendTelemetryEvent(event: ITelemetryGenericEvent, error?: any) {
    }
    public sendErrorEvent(event: ITelemetryErrorEvent, error?: any) {
    }
    public sendPerformanceEvent(event: ITelemetryPerformanceEvent, error?: any): void {
    }
}

export function extractLogSafeErrorProperties(error: any) {
    const isRegularObject = (value: any): boolean => {
        return value !== null && !Array.isArray(value) && typeof value === "object";
    };

    const removeMessageFromStack = (stack: string, errorName?: string) => {
        const stackFrames = stack.split("\n");
        stackFrames.shift(); // Remove "[ErrorName]: [ErrorMessage]"
        if (errorName !== undefined) {
            stackFrames.unshift(errorName); // Add "[ErrorName]"
        }
        return stackFrames.join("\n");
    };

    const message = (typeof error?.message === "string")
        ? error.message as string
        : String(error);

    const safeProps: { message: string; errorType?: string; stack?: string } = {
        message,
    };

    if (isRegularObject(error)) {
        const { errorType, stack, name } = error;

        if (typeof errorType === "string") {
            safeProps.errorType = errorType;
        }

        if (typeof stack === "string") {
            const errorName = (typeof name === "string") ? name : undefined;
            safeProps.stack = removeMessageFromStack(stack, errorName);
        }
    }

    return safeProps;
}

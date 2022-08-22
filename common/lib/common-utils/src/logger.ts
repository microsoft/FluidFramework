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
 * @deprecated BaseTelemetryNullLogger has been moved to the \@fluidframework/telemetry-utils package.
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
 * @deprecated TelemetryNullLogger has been moved to the \@fluidframework/telemetry-utils package.
 */
export class TelemetryNullLogger implements ITelemetryLogger {
    public send(event: ITelemetryBaseEvent): void {}
    public sendTelemetryEvent(event: ITelemetryGenericEvent, error?: any): void {}
    public sendErrorEvent(event: ITelemetryErrorEvent, error?: any): void {}
    public sendPerformanceEvent(event: ITelemetryPerformanceEvent, error?: any): void {}
}

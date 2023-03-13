/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { TelemetryLogger, ITelemetryLoggerPropertyBags } from "@fluidframework/telemetry-utils";
/**
 * Logger implementation that posts all telemetry events to the window (globalThis object).
 *
 * @remarks This logger is intended to integrate with the Fluid Debugger DevTools extension.
 *
 * @sealed
 * @internal
 */
export declare class FluidDebuggerLogger extends TelemetryLogger {
    /**
     * Create an instance of this logger
     * @param namespace - Telemetry event name prefix to add to all events
     * @param properties - Base properties to add to all events
     */
    static create(namespace?: string, properties?: ITelemetryLoggerPropertyBags): TelemetryLogger;
    /**
     * Mix in this logger with another.
     * The returned logger will output events to the newly created DevTools extension logger *and* the base logger.
     * @param namespace - Telemetry event name prefix to add to all events
     * @param baseLogger - Base logger to output events (in addition to DevTools extension logger being created). Can be undefined.
     * @param properties - Base properties to add to all events
     */
    static mixinLogger(namespace?: string, baseLogger?: ITelemetryBaseLogger, properties?: ITelemetryLoggerPropertyBags): TelemetryLogger;
    private static tryGetBaseLoggerProps;
    private constructor();
    /**
     * Post a telemetry event to the window (globalThis object).
     *
     * @param event - the event to send
     */
    send(event: ITelemetryBaseEvent): void;
    /**
     * Message logging options used by the logger for messages posted to the console.
     */
    private static readonly RegistryMessageLoggingOptions;
}
//# sourceMappingURL=FluidDebuggerLogger.d.ts.map
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TelemetryLogger, MultiSinkLogger, ChildLogger, } from "@fluidframework/telemetry-utils";
import { debuggerMessageSource, postMessageToWindow, } from "./messaging";
/**
 * Logger implementation that posts all telemetry events to the window (globalThis object).
 *
 * @remarks This logger is intended to integrate with the Fluid Debugger DevTools extension.
 *
 * @sealed
 * @internal
 */
export class FluidDebuggerLogger extends TelemetryLogger {
    constructor(namespace, properties) {
        super(namespace, properties);
    }
    /**
     * Create an instance of this logger
     * @param namespace - Telemetry event name prefix to add to all events
     * @param properties - Base properties to add to all events
     */
    static create(namespace, properties) {
        return new FluidDebuggerLogger(namespace, properties);
    }
    /**
     * Mix in this logger with another.
     * The returned logger will output events to the newly created DevTools extension logger *and* the base logger.
     * @param namespace - Telemetry event name prefix to add to all events
     * @param baseLogger - Base logger to output events (in addition to DevTools extension logger being created). Can be undefined.
     * @param properties - Base properties to add to all events
     */
    static mixinLogger(namespace, baseLogger, properties) {
        if (!baseLogger) {
            return FluidDebuggerLogger.create(namespace, properties);
        }
        const multiSinkLogger = new MultiSinkLogger(undefined, properties);
        multiSinkLogger.addLogger(FluidDebuggerLogger.create(namespace, this.tryGetBaseLoggerProps(baseLogger)));
        multiSinkLogger.addLogger(ChildLogger.create(baseLogger, namespace));
        return multiSinkLogger;
    }
    static tryGetBaseLoggerProps(baseLogger) {
        if (baseLogger instanceof TelemetryLogger) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return baseLogger.properties;
        }
        return undefined;
    }
    /**
     * Post a telemetry event to the window (globalThis object).
     *
     * @param event - the event to send
     */
    send(event) {
        // TODO: ability to disable the logger so this becomes a no-op
        const newEvent = this.prepareEvent(event);
        postMessageToWindow({
            source: debuggerMessageSource,
            type: "TELEMETRY_EVENT",
            data: {
                contents: newEvent,
            },
        }, FluidDebuggerLogger.RegistryMessageLoggingOptions);
    }
}
/**
 * Message logging options used by the logger for messages posted to the console.
 */
FluidDebuggerLogger.RegistryMessageLoggingOptions = {
    context: "DEBUGGER TELEMETRY",
};
//# sourceMappingURL=FluidDebuggerLogger.js.map
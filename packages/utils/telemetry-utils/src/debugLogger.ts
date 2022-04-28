/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ITelemetryBaseEvent,
    ITelemetryBaseLogger,
    ITelemetryProperties,
} from "@fluidframework/common-definitions";
import { performance } from "@fluidframework/common-utils";
import { debug as registerDebug, IDebugger } from "debug";
import { TelemetryLogger, MultiSinkLogger, ChildLogger, ITelemetryLoggerPropertyBags } from "./logger";

/**
 * Implementation of debug logger
 */
export class DebugLogger extends TelemetryLogger {
    /**
     * Create debug logger - all events are output to debug npm library
     * @param namespace - Telemetry event name prefix to add to all events
     * @param properties - Base properties to add to all events
     * @param propertyGetters - Getters to add additional properties to all events
     */
    public static create(
        namespace: string,
        properties?: ITelemetryLoggerPropertyBags,
    ): TelemetryLogger {
        // Setup base logger upfront, such that host can disable it (if needed)
        const debug = registerDebug(namespace);

        const debugErr = registerDebug(namespace);
        debugErr.log = console.error.bind(console);
        debugErr.enabled = true;

        return new DebugLogger(debug, debugErr, properties);
    }

    /**
     * Mix in debug logger with another logger.
     * Returned logger will output events to both newly created debug logger, as well as base logger
     * @param namespace - Telemetry event name prefix to add to all events
     * @param properties - Base properties to add to all events
     * @param propertyGetters - Getters to add additional properties to all events
     * @param baseLogger - Base logger to output events (in addition to debug logger being created). Can be undefined.
     */
    public static mixinDebugLogger(
        namespace: string,
        baseLogger?: ITelemetryBaseLogger,
        properties?: ITelemetryLoggerPropertyBags,
    ): TelemetryLogger {
        if (!baseLogger) {
            return DebugLogger.create(namespace, properties);
        }

        const multiSinkLogger = new MultiSinkLogger(undefined, properties);
        multiSinkLogger.addLogger(DebugLogger.create(namespace, this.tryGetBaseLoggerProps(baseLogger)));
        multiSinkLogger.addLogger(ChildLogger.create(baseLogger, namespace));

        return multiSinkLogger;
    }

    private static tryGetBaseLoggerProps(baseLogger?: ITelemetryBaseLogger) {
        if (baseLogger instanceof TelemetryLogger) {
            return (baseLogger as any as { properties: ITelemetryLoggerPropertyBags }).properties;
        }
        return undefined;
    }

    constructor(
        private readonly debug: IDebugger,
        private readonly debugErr: IDebugger,
        properties?: ITelemetryLoggerPropertyBags,
    ) {
        super(undefined, properties);
    }

    /**
     * Send an event to debug loggers
     *
     * @param event - the event to send
     */
    public send(event: ITelemetryBaseEvent): void {
        const newEvent: ITelemetryProperties = this.prepareEvent(event);
        const isError = newEvent.category === "error";
        let logger = isError ? this.debugErr : this.debug;

        // Use debug's coloring schema for base of the event
        const index = event.eventName.lastIndexOf(TelemetryLogger.eventNamespaceSeparator);
        const name = event.eventName.substring(index + 1);
        if (index > 0) {
            logger = logger.extend(event.eventName.substring(0, index));
        }
        newEvent.eventName = undefined;

        let tick = "";
        tick = `tick=${TelemetryLogger.formatTick(performance.now())}`;

        // Extract stack to put it last, but also to avoid escaping '\n' in it by JSON.stringify below
        const stack = newEvent.stack ? newEvent.stack : "";
        newEvent.stack = undefined;

        // Watch out for circular references - they can come from two sources
        // 1) error object - we do not control it and should remove it and retry
        // 2) properties supplied by telemetry caller - that's a bug that should be addressed!
        let payload: string;
        try {
            payload = JSON.stringify(newEvent);
        } catch (error) {
            newEvent.error = undefined;
            payload = JSON.stringify(newEvent);
        }

        if (payload === "{}") {
            payload = "";
        }

        // Force errors out, to help with diagnostics
        if (isError) {
            logger.enabled = true;
        }

        // Print multi-line.
        logger(`${name} ${payload} ${tick} ${stack}`);
    }
}

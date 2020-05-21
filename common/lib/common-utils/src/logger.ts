/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ITelemetryBaseEvent,
    ITelemetryBaseLogger,
    ITelemetryErrorEvent,
    ITelemetryGenericEvent,
    ITelemetryLogger,
    ITelemetryPerformanceEvent,
    ITelemetryProperties,
    TelemetryEventPropertyType,
} from "@microsoft/fluid-common-definitions";
import { debug as registerDebug, IDebugger } from "debug";
import { performanceNow } from "./performanceNowNode";

export interface ITelemetryPropertyGetters {
    [index: string]: () => TelemetryEventPropertyType;
}

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
 * TelemetryLogger class contains various helper telemetry methods,
 * encoding in one place schemas for various types of Fluid telemetry events.
 * Creates sub-logger that appends properties to all events
 */
export abstract class TelemetryLogger implements ITelemetryLogger {
    public static readonly eventNamespaceSeparator = ":";

    public static formatTick(tick: number): number {
        return Math.floor(tick);
    }

    /**
     * Attempts to parse number from string.
     * If fails,returns original string.
     * Used to make telemetry data typed (and support math operations, like comparison),
     * in places where we do expect numbers (like contentsize/duration property in http header)
     */
    public static numberFromString(str: string | null | undefined): string | number | undefined {
        if (str === undefined || str === null) {
            return undefined;
        }
        const num = Number(str);
        return Number.isNaN(num) ? str : num;
    }

    public static sanitizePkgName(name: string) {
        return name.replace("@", "").replace("/", "-");
    }

    public static prepareErrorObject(event: ITelemetryBaseEvent, error: any, fetchStack: boolean) {
        if (error === null || typeof error !== "object") {
            event.error = error;
        } else {
            // WARNING: Exceptions can contain PII!
            // For example, XHR will throw object derived from Error that contains config information
            // for failed request, including all the headers, and thus - user tokens!
            // Extract only call stack, message, and couple network-related properties form error object

            const errorAsObject = error as {
                stack?: string;
                message?: string;
            };

            event.stack = errorAsObject.stack;
            event.error = errorAsObject.message;

            // Error message can container PII information.
            // If we know for sure it does, we have to not log it.
            if (error.containsPII) {
                event.error = "Error message was removed as it contained PII";
            } else if (error.getCustomProperties) {
                const customProps: object = error.getCustomProperties();
                for (const key of Object.keys(customProps)) {
                    if (event[key] === undefined) {
                        event[key] = customProps[key];
                    }
                }
            }
        }

        // Collect stack if we were not able to extract it from error
        if (event.stack === undefined && fetchStack) {
            event.stack = TelemetryLogger.getStack();
        }
    }

    protected static getStack(): string | undefined {
        // Some browsers will populate stack right away, others require throwing Error
        let stack = new Error().stack;
        if (!stack) {
            try {
                throw new Error();
            } catch (e) {
                stack = e.stack;
            }
        }
        return stack;
    }

    protected constructor(
        private readonly namespace?: string,
        private readonly properties?: object,
        private readonly propertyGetters?: ITelemetryPropertyGetters) {
    }

    /**
     * Send an event with the logger
     *
     * @param event - the event to send
     */
    public abstract send(event: ITelemetryBaseEvent): void;

    /**
     * Send a telemetry event with the logger
     *
     * @param event - the event to send
     * @param error - optional error object to log
     */
    public sendTelemetryEvent(event: ITelemetryGenericEvent, error?: any) {
        const newEvent: ITelemetryBaseEvent = { ...event, category: event.category ? event.category : "generic" };
        if (error !== undefined) {
            TelemetryLogger.prepareErrorObject(newEvent, error, false);
        }
        this.send(newEvent);
    }

    /**
     * Send an error telemetry event with the logger
     *
     * @param event - the event to send
     * @param error - optional error object to log
     */
    public sendErrorEvent(event: ITelemetryErrorEvent, error?: any) {
        const newEvent: ITelemetryBaseEvent = { ...event, category: "error" };
        TelemetryLogger.prepareErrorObject(newEvent, error, true);
        this.send(newEvent);
    }

    /**
     * Send a performance telemetry event with the logger
     *
     * @param event - Event to send
     * @param error - optional error object to log
     */
    public sendPerformanceEvent(event: ITelemetryPerformanceEvent, error?: any): void {
        const perfEvent: ITelemetryBaseEvent = {
            ...event,
            category: event.category ? event.category : "performance",
        };
        if (error !== undefined) {
            TelemetryLogger.prepareErrorObject(perfEvent, error, false);
        }

        if (event.duration) {
            perfEvent.duration = TelemetryLogger.formatTick(event.duration);
        }

        this.send(perfEvent);
    }

    /**
     * Log generic error with the logger
     *
     * @param eventName - the name of the event
     * @param error - the error object to include in the event, require to be JSON-able
     */
    public logGenericError(eventName: string, error: any) {
        this.sendErrorEvent({ eventName }, error);
    }

    /**
     * Helper method to log exceptions
     * @param event - the event to send
     * @param exception - Exception object to add to an event
     */
    public logException(event: ITelemetryErrorEvent, exception: any): void {
        this.sendErrorEvent({ ...event, isException: true }, exception);
    }

    /**
     * Log an debug assert with the logger
     *
     * @param condition - the condition to assert on
     * @param event - the event to log if the condition fails
     */
    public debugAssert(condition: boolean, event?: ITelemetryErrorEvent): void {
        this.shipAssert(condition, event);
    }

    /**
     * Log an ship assert with the logger
     *
     * @param condition - the condition to assert on
     * @param event - the event to log if the condition fails
     */
    public shipAssert(condition: boolean, event?: ITelemetryErrorEvent): void {
        if (!condition) {
            const realEvent: ITelemetryErrorEvent = event === undefined ? { eventName: "Assert" } : event;
            realEvent.isAssert = true;
            realEvent.stack = TelemetryLogger.getStack();
            this.sendErrorEvent(realEvent);
        }
    }

    protected prepareEvent(event: ITelemetryBaseEvent): ITelemetryBaseEvent {
        const newEvent: ITelemetryBaseEvent = { ...this.properties, ...event };
        if (this.namespace !== undefined) {
            newEvent.eventName = `${this.namespace}${TelemetryLogger.eventNamespaceSeparator}${newEvent.eventName}`;
        }
        // Evaluate any getter functions
        if (this.propertyGetters) {
            for (const key of Object.keys(this.propertyGetters)) {
                if (event[key] !== undefined) {
                    // Properties directly on the event take priority
                    continue;
                }
                const getter = this.propertyGetters[key];

                // If this throws, hopefully it is handled elsewhere
                const value = getter();
                if (value !== undefined) {
                    newEvent[key] = value;
                }
            }
        }

        return newEvent;
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
    public logGenericError(eventName: string, error: any) {
    }
    public logException(event: ITelemetryErrorEvent, exception: any): void {
    }
    public debugAssert(condition: boolean, event?: ITelemetryErrorEvent): void {
    }
    public shipAssert(condition: boolean, event?: ITelemetryErrorEvent): void {
    }
}

/**
 * ChildLogger class contains various helper telemetry methods,
 * encoding in one place schemas for various types of Fluid telemetry events.
 * Creates sub-logger that appends properties to all events
 */
export class ChildLogger extends TelemetryLogger {
    /**
     * Create child logger
     * @param baseLogger - Base logger to use to output events. If undefined, proper child logger
     * is created, but it does not sends telemetry events anywhere.
     * @param namespace - Telemetry event name prefix to add to all events
     * @param properties - Base properties to add to all events
     * @param propertyGetters - Getters to add additional properties to all events
     */
    public static create(
        baseLogger?: ITelemetryBaseLogger,
        namespace?: string,
        properties?: object,
        propertyGetters?: ITelemetryPropertyGetters): TelemetryLogger {
        return new ChildLogger(
            baseLogger ? baseLogger : new BaseTelemetryNullLogger(),
            namespace,
            properties,
            propertyGetters);
    }

    constructor(
        protected readonly logger: ITelemetryBaseLogger,
        namespace?: string,
        properties?: object,
        propertyGetters?: ITelemetryPropertyGetters) {
        super(namespace, properties, propertyGetters);
    }

    /**
     * Send an event with the logger
     *
     * @param event - the event to send
     */
    public send(event: ITelemetryBaseEvent): void {
        this.logger.send(this.prepareEvent(event));
    }
}

/**
 * Multi-sink logger
 * Takes multiple ITelemetryBaseLogger objects (sinks) and logs all events into each sink
 * Implements ITelemetryBaseLogger (through static create() method)
 */
export class MultiSinkLogger extends TelemetryLogger {
    protected loggers: ITelemetryBaseLogger[] = [];

    /**
     * Create multiple sink logger (i.e. logger that sends events to multiple sinks)
     * @param namespace - Telemetry event name prefix to add to all events
     * @param properties - Base properties to add to all events
     * @param propertyGetters - Getters to add additional properties to all events
     */
    constructor(
        namespace?: string,
        properties?: object,
        propertyGetters?: ITelemetryPropertyGetters) {
        super(namespace, properties, propertyGetters);
    }

    /**
     * Add logger to send all events to
     * @param logger - Logger to add
     */
    public addLogger(logger?: ITelemetryBaseLogger) {
        if (logger !== undefined && logger !== null) {
            this.loggers.push(logger);
        }
    }

    /**
     * Send an event to the loggers
     *
     * @param event - the event to send to all the registered logger
     */
    public send(event: ITelemetryBaseEvent): void {
        const newEvent = this.prepareEvent(event);
        this.loggers.forEach((logger: ITelemetryBaseLogger) => {
            logger.send(newEvent);
        });
    }
}

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
        properties?: object,
        propertyGetters?: ITelemetryPropertyGetters): TelemetryLogger {
        // Setup base logger upfront, such that host can disable it (if needed)
        const debug = registerDebug(namespace);

        const debugErr = registerDebug(namespace);
        debugErr.log = console.error.bind(console);
        debugErr.enabled = true;

        return new DebugLogger(debug, debugErr, properties, propertyGetters);
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
        properties?: object,
        propertyGetters?: ITelemetryPropertyGetters): TelemetryLogger {
        if (!baseLogger) {
            return DebugLogger.create(namespace, properties, propertyGetters);
        }

        const multiSinkLogger = new MultiSinkLogger(undefined, properties, propertyGetters);
        multiSinkLogger.addLogger(DebugLogger.create(namespace));
        multiSinkLogger.addLogger(ChildLogger.create(baseLogger, namespace));

        return multiSinkLogger;
    }

    constructor(
        private readonly debug: IDebugger,
        private readonly debugErr: IDebugger,
        properties?: object,
        propertyGetters?: ITelemetryPropertyGetters,
    ) {
        super(undefined, properties, propertyGetters);
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
        if (event.category === "performance") {
            tick = `tick=${TelemetryLogger.formatTick(performanceNow())}`;
        }

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

/**
 * Helper class to log performance events
 */
export class PerformanceEvent {
    public static start(logger: ITelemetryLogger, event: ITelemetryGenericEvent) {
        return new PerformanceEvent(logger, event);
    }

    private event?: ITelemetryGenericEvent;
    private readonly startTime = performanceNow();
    private startMark?: string;

    protected constructor(
        private readonly logger: ITelemetryLogger,
        event: ITelemetryGenericEvent) {
        this.event = { ...event };
        this.reportEvent("start");

        if (typeof window === "object" && window != null && window.performance) {
            this.startMark = `${event.eventName}-start`;
            window.performance.mark(this.startMark);
        }
    }

    public reportProgress(props?: object, eventNameSuffix: string = "update"): void {
        this.reportEvent(eventNameSuffix, props);
    }

    public end(props?: object, eventNameSuffix = "end"): void {
        this.reportEvent(eventNameSuffix, props);

        if (this.startMark) {
            const endMark = `${this.event!.eventName}-${eventNameSuffix}`;
            window.performance.mark(endMark);
            window.performance.measure(`${this.event!.eventName}`, this.startMark, endMark);
            this.startMark = undefined;
        }

        this.event = undefined;
    }

    public cancel(props?: object, error?: any): void {
        this.reportEvent("cancel", props, error);
        this.event = undefined;
    }

    public reportEvent(eventNameSuffix: string, props?: object, error?: any): void {
        if (!this.event) {
            this.logger.sendErrorEvent({
                eventName: "PerformanceEventAfterStop",
                perfEventName: this.event!.eventName,
                eventNameSuffix,
            });
            return;
        }

        const event: ITelemetryPerformanceEvent = { ...this.event, ...props };
        event.eventName = `${event.eventName}_${eventNameSuffix}`;
        if (eventNameSuffix !== "start") {
            event.duration = performanceNow() - this.startTime;
        }

        this.logger.sendPerformanceEvent(event, error);
    }
}

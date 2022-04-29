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
    ITelemetryProperties,
    TelemetryEventPropertyType,
    ITaggedTelemetryPropertyType,
    TelemetryEventCategory,
} from "@fluidframework/common-definitions";
import { BaseTelemetryNullLogger, performance } from "@fluidframework/common-utils";
import {
    CachedConfigProvider,
    loggerIsMonitoringContext,
    mixinMonitoringContext,
} from "./config";
import {
    isILoggingError,
    extractLogSafeErrorProperties,
    generateStack,
} from "./errorLogging";

/**
 * Broad classifications to be applied to individual properties as they're prepared to be logged to telemetry.
 * Please do not modify existing entries for backwards compatibility.
 */
 export enum TelemetryDataTag {
    /** Data containing terms from code packages that may have been dynamically loaded */
    PackageData = "PackageData",
    /** Personal data of a variety of classifications that pertains to the user */
    UserData = "UserData",
}

export type TelemetryEventPropertyTypes = TelemetryEventPropertyType | ITaggedTelemetryPropertyType;

export interface ITelemetryLoggerPropertyBag {
    [index: string]: TelemetryEventPropertyTypes | (() => TelemetryEventPropertyTypes);
}
export interface ITelemetryLoggerPropertyBags{
    all?: ITelemetryLoggerPropertyBag,
    error?: ITelemetryLoggerPropertyBag,
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

    /**
     * Take an unknown error object and add the appropriate info from it to the event. Message and stack will be copied
     * over from the error object, along with other telemetry properties if it's an ILoggingError.
     * @param event - Event being logged
     * @param error - Error to extract info from
     * @param fetchStack - Whether to fetch the current callstack if error.stack is undefined
     */
    public static prepareErrorObject(event: ITelemetryBaseEvent, error: any, fetchStack: boolean) {
        const { message, errorType, stack } = extractLogSafeErrorProperties(error, true /* sanitizeStack */);
        // First, copy over error message, stack, and errorType directly (overwrite if present on event)
        event.stack = stack;
        event.error = message; // Note that the error message goes on the 'error' field
        event.errorType = errorType;

        if (isILoggingError(error)) {
            // Add any other telemetry properties from the LoggingError
            const telemetryProp = error.getTelemetryProperties();
            for (const key of Object.keys(telemetryProp)) {
                if (event[key] !== undefined) {
                    // Don't overwrite existing properties on the event
                    continue;
                }
                event[key] = telemetryProp[key];
            }
        }

        // Collect stack if we were not able to extract it from error
        if (event.stack === undefined && fetchStack) {
            event.stack = generateStack();
        }
    }

    public constructor(
        protected readonly namespace?: string,
        protected readonly properties?: ITelemetryLoggerPropertyBags) {
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
        this.sendTelemetryEventCore({ ...event, category: event.category ?? "generic" }, error);
    }

    /**
     * Send a telemetry event with the logger
     *
     * @param event - the event to send
     * @param error - optional error object to log
     */
     protected sendTelemetryEventCore(
        event: ITelemetryGenericEvent & { category: TelemetryEventCategory },
        error?: any) {
        const newEvent = { ...event };
        if (error !== undefined) {
            TelemetryLogger.prepareErrorObject(newEvent, error, false);
        }

        // Will include Nan & Infinity, but probably we do not care
        if (typeof newEvent.duration === "number") {
            newEvent.duration = TelemetryLogger.formatTick(newEvent.duration);
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
        this.sendTelemetryEventCore({ ...event, category: "error" }, error);
    }

    /**
     * Send a performance telemetry event with the logger
     *
     * @param event - Event to send
     * @param error - optional error object to log
     */
    public sendPerformanceEvent(event: ITelemetryPerformanceEvent, error?: any): void {
        const perfEvent = {
            ...event,
            category: event.category ?? "performance",
        };

        this.sendTelemetryEventCore(perfEvent, error);
    }

    protected prepareEvent(event: ITelemetryBaseEvent): ITelemetryBaseEvent {
        const includeErrorProps = event.category === "error" || event.error !== undefined;
        const newEvent: ITelemetryBaseEvent = {
            ...event,
        };
        if (this.namespace !== undefined) {
            newEvent.eventName = `${this.namespace}${TelemetryLogger.eventNamespaceSeparator}${newEvent.eventName}`;
        }
        if (this.properties) {
            const properties: (undefined | ITelemetryLoggerPropertyBag)[] = [];
            properties.push(this.properties.all);
            if (includeErrorProps) {
                properties.push(this.properties.error);
            }
            for (const props of properties) {
                if (props !== undefined) {
                    for (const key of Object.keys(props)) {
                        if (event[key] !== undefined) {
                            continue;
                        }
                        const getterOrValue = props[key];
                        // If this throws, hopefully it is handled elsewhere
                        const value = typeof getterOrValue === "function" ? getterOrValue() : getterOrValue;
                        if (value !== undefined) {
                            newEvent[key] = value;
                        }
                    }
                }
            }
        }
        return newEvent;
    }
}

/**
 * @deprecated 0.56, remove TaggedLoggerAdapter once its usage is removed from
 * container-runtime. Issue: #8191
 * TaggedLoggerAdapter class can add tag handling to your logger.
 */
 export class TaggedLoggerAdapter implements ITelemetryBaseLogger {
    public constructor(
        private readonly logger: ITelemetryBaseLogger) {
    }

    public send(eventWithTagsMaybe: ITelemetryBaseEvent) {
        const newEvent: ITelemetryBaseEvent = {
            category: eventWithTagsMaybe.category,
            eventName: eventWithTagsMaybe.eventName,
        };
        for (const key of Object.keys(eventWithTagsMaybe)) {
            const taggableProp = eventWithTagsMaybe[key];
            const { value, tag } = (typeof taggableProp === "object")
                ? taggableProp
                : { value: taggableProp, tag: undefined };
            switch (tag) {
                case undefined:
                    // No tag means we can log plainly
                    newEvent[key] = value;
                    break;
                case TelemetryDataTag.PackageData:
                    // For Microsoft applications, PackageData is safe for now
                    // (we don't load 3P code in 1P apps)
                    newEvent[key] = value;
                    break;
                case TelemetryDataTag.UserData:
                    // Strip out anything tagged explicitly as PII.
                    // Alternate strategy would be to hash these props
                    newEvent[key] = "REDACTED (UserData)";
                    break;
                default:
                    // If we encounter a tag we don't recognize
                    // then we must assume we should scrub.
                    newEvent[key] = "REDACTED (unknown tag)";
                    break;
            }
        }
        this.logger.send(newEvent);
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
        properties?: ITelemetryLoggerPropertyBags): TelemetryLogger {
        // if we are creating a child of a child, rather than nest, which will increase
        // the callstack overhead, just generate a new logger that includes everything from the previous
        if (baseLogger instanceof ChildLogger) {
            const combinedProperties: ITelemetryLoggerPropertyBags = {};
            for (const extendedProps of [baseLogger.properties, properties]) {
                if (extendedProps !== undefined) {
                    if (extendedProps.all !== undefined) {
                        combinedProperties.all = {
                            ... combinedProperties.all,
                            ... extendedProps.all,
                        };
                    }
                    if (extendedProps.error !== undefined) {
                        combinedProperties.error = {
                            ... combinedProperties.error,
                            ... extendedProps.error,
                        };
                    }
                }
            }

            const combinedNamespace = baseLogger.namespace === undefined
                ? namespace
                : namespace === undefined
                    ? baseLogger.namespace
                    : `${baseLogger.namespace}${TelemetryLogger.eventNamespaceSeparator}${namespace}`;

            return new ChildLogger(
                baseLogger.baseLogger,
                combinedNamespace,
                combinedProperties,
            );
        }

        return new ChildLogger(
            baseLogger ? baseLogger : new BaseTelemetryNullLogger(),
            namespace,
            properties);
    }

    private constructor(
        protected readonly baseLogger: ITelemetryBaseLogger,
        namespace: string | undefined,
        properties: ITelemetryLoggerPropertyBags | undefined,
    ) {
        super(namespace, properties);

        // propagate the monitoring context
        if (loggerIsMonitoringContext(baseLogger)) {
            mixinMonitoringContext(
                this,
                new CachedConfigProvider(baseLogger.config));
        }
    }

    /**
     * Send an event with the logger
     *
     * @param event - the event to send
     */
    public send(event: ITelemetryBaseEvent): void {
        this.baseLogger.send(this.prepareEvent(event));
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
        properties?: ITelemetryLoggerPropertyBags) {
        super(namespace, properties);
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
 * Describes what events PerformanceEvent should log
 * By default, all events are logged, but client can override this behavior
 * For example, there is rarely a need to record start event, as we really after
 * success / failure tracking, including duration (on success).
 */
export interface IPerformanceEventMarkers {
    start?: true;
    end?: true;
    cancel?: "generic" | "error"; // tells wether to issue "generic" or "error" category cancel event
}

/**
 * Helper class to log performance events
 */
export class PerformanceEvent {
    public static start(logger: ITelemetryLogger, event: ITelemetryGenericEvent, markers?: IPerformanceEventMarkers) {
        return new PerformanceEvent(logger, event, markers);
    }

    public static timedExec<T>(
        logger: ITelemetryLogger,
        event: ITelemetryGenericEvent,
        callback: (event: PerformanceEvent) => T,
        markers?: IPerformanceEventMarkers,
    ) {
        const perfEvent = PerformanceEvent.start(logger, event, markers);
        try {
            const ret = callback(perfEvent);
            perfEvent.autoEnd();
            return ret;
        } catch (error) {
            perfEvent.cancel(undefined, error);
            throw error;
        }
    }

    public static async timedExecAsync<T>(
        logger: ITelemetryLogger,
        event: ITelemetryGenericEvent,
        callback: (event: PerformanceEvent) => Promise<T>,
        markers?: IPerformanceEventMarkers,
    ) {
        const perfEvent = PerformanceEvent.start(logger, event, markers);
        try {
            const ret = await callback(perfEvent);
            perfEvent.autoEnd();
            return ret;
        } catch (error) {
            perfEvent.cancel(undefined, error);
            throw error;
        }
    }

    public get duration() { return performance.now() - this.startTime; }

    private event?: ITelemetryGenericEvent;
    private readonly startTime = performance.now();
    private startMark?: string;

    protected constructor(
        private readonly logger: ITelemetryLogger,
        event: ITelemetryGenericEvent,
        private readonly markers: IPerformanceEventMarkers = { end: true, cancel: "generic" },
    ) {
        this.event = { ...event };
        if (this.markers.start) {
            this.reportEvent("start");
        }

        if (typeof window === "object" && window != null && window.performance) {
            this.startMark = `${event.eventName}-start`;
            window.performance.mark(this.startMark);
        }
    }

    public reportProgress(props?: ITelemetryProperties, eventNameSuffix: string = "update"): void {
        this.reportEvent(eventNameSuffix, props);
    }

    private autoEnd() {
        // Event might have been cancelled or ended in the callback
        if (this.event && this.markers.end) {
            this.reportEvent("end");
        }
        this.performanceEndMark();
        this.event = undefined;
    }

    public end(props?: ITelemetryProperties): void {
        this.reportEvent("end", props);
        this.performanceEndMark();
        this.event = undefined;
    }

    private performanceEndMark() {
        if (this.startMark && this.event) {
            const endMark = `${this.event.eventName}-end`;
            window.performance.mark(endMark);
            window.performance.measure(`${this.event.eventName}`, this.startMark, endMark);
            this.startMark = undefined;
        }
    }

    public cancel(props?: ITelemetryProperties, error?: any): void {
        if (this.markers.cancel !== undefined) {
            this.reportEvent("cancel", { category: this.markers.cancel, ...props }, error);
        }
        this.event = undefined;
    }

    /**
     * Report the event, if it hasn't already been reported.
     */
    public reportEvent(eventNameSuffix: string, props?: ITelemetryProperties, error?: any) {
        // There are strange sequences involving multiple Promise chains
        // where the event can be cancelled and then later a callback is invoked
        // and the caller attempts to end directly, e.g. issue #3936. Just return.
        if (!this.event) {
            return;
        }

        const event: ITelemetryPerformanceEvent = { ...this.event, ...props };
        event.eventName = `${event.eventName}_${eventNameSuffix}`;
        if (eventNameSuffix !== "start") {
            event.duration = this.duration;
        }

        this.logger.sendPerformanceEvent(event, error);
    }
}

/**
 * Logger that is useful for UT
 * It can be used in places where logger instance is required, but events should be not send over.
 */
 export class TelemetryUTLogger implements ITelemetryLogger {
    public send(event: ITelemetryBaseEvent): void {
    }
    public sendTelemetryEvent(event: ITelemetryGenericEvent, error?: any) {
    }
    public sendErrorEvent(event: ITelemetryErrorEvent, error?: any) {
        this.reportError("errorEvent in UT logger!", event, error);
    }
    public sendPerformanceEvent(event: ITelemetryPerformanceEvent, error?: any): void {
    }
    public logGenericError(eventName: string, error: any) {
        this.reportError(`genericError in UT logger!`, { eventName }, error);
    }
    public logException(event: ITelemetryErrorEvent, exception: any): void {
        this.reportError("exception in UT logger!", event, exception);
    }
    public debugAssert(condition: boolean, event?: ITelemetryErrorEvent): void {
        this.reportError("debugAssert in UT logger!");
    }
    public shipAssert(condition: boolean, event?: ITelemetryErrorEvent): void {
        this.reportError("shipAssert in UT logger!");
    }

    private reportError(message: string, event?: ITelemetryErrorEvent, err?: any) {
        const error = new Error(message);
        (error as any).error = error;
        (error as any).event = event;
        // report to console as exception can be eaten
        console.error(message);
        console.error(error);
        throw error;
    }
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ILoggingError,
    ITaggedTelemetryPropertyType,
    ITelemetryBaseEvent,
    ITelemetryBaseLogger,
    ITelemetryErrorEvent,
    ITelemetryGenericEvent,
    ITelemetryLogger,
    ITelemetryPerformanceEvent,
    ITelemetryProperties,
    TelemetryEventPropertyType,
} from "@fluidframework/common-definitions";
import { assert, BaseTelemetryNullLogger, performance } from "@fluidframework/common-utils";
import {
    Builder,
    IFluidErrorBase,
    hasErrorType,
    isFluidError,
    ExtensibleObject,
    isILoggingError,
    isErrorLike,
} from "./staging";

export interface ITelemetryLoggerPropertyBag {
    [index: string]: TelemetryEventPropertyType | (() => TelemetryEventPropertyType);
}
export interface ITelemetryLoggerPropertyBags{
    all?: ITelemetryLoggerPropertyBag,
    error?: ITelemetryLoggerPropertyBag,
}

const isRegularObject = (value: any): boolean => {
    return value !== null && !Array.isArray(value) && typeof value === "object";
};

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

    private static extractLogSafeErrorProperties(error: any) {
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

    /**
     * Take an unknown error object and add the appropriate info from it to the event
     * NOTE - message and stack will be copied over from the error object,
     * along with other telemetry properties if it's an ILoggingError
     * @param event - Event being logged
     * @param error - Error to extract info from
     * @param fetchStack - Whether to fetch the current callstack if error.stack is undefined
     */
    public static prepareErrorObject(event: ITelemetryBaseEvent, error: any, fetchStack: boolean) {
        const { message, errorType, stack} = this.extractLogSafeErrorProperties(error);
        // First, copy over error message, stack, and errorType directly (overwrite if present on event)
        event.stack = stack;
        event.error = message; // Note that the error message goes on the 'error' field
        event.errorType = errorType;

        if (isILoggingError(error)) {
            // Add any other telemetry properties from the LoggingError
            const taggableProps = error.getTelemetryProperties();
            for (const key of Object.keys(taggableProps)) {
                if (event[key] !== undefined) {
                    // Don't overwrite existing properties on the event
                    continue;
                }
                const taggableProp = taggableProps[key];
                const { value, tag } = (typeof taggableProp === "object")
                    ? taggableProp
                    : { value: taggableProp, tag: undefined };
                switch (tag) {
                    case undefined:
                        // No tag means we can log plainly
                        event[key] = value;
                        break;
                    case TelemetryDataTag.PackageData:
                        // For Microsoft applications, PackageData is safe for now
                        // (we don't load 3P code in 1P apps)
                        // But this determination really belongs in the host layer
                        event[key] = value;
                        break;
                    case TelemetryDataTag.UserData:
                        // Strip out anything tagged explicitly as PII.
                        // Alternate strategy would be to hash these props
                        event[key] = "REDACTED (UserData)";
                        break;
                    default:
                        // If we encounter a tag we don't recognize
                        // then we must assume we should scrub.
                        event[key] = "REDACTED (unknown tag)";
                        break;
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
        const newEvent: ITelemetryBaseEvent = {
            ...event,
            category: event.category ?? (error === undefined ?  "generic" : "error"),
        };
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
        this.sendTelemetryEvent({ ...event, category: "error" }, error);
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

    protected prepareEvent(event: ITelemetryBaseEvent): ITelemetryBaseEvent {
        const includeErrorProps = event.category === "error" || event.error !== undefined;
        const newEvent: ITelemetryBaseEvent = {
            ...event,
        };
        if (this.namespace !== undefined) {
            newEvent.eventName = `${this.namespace}${TelemetryLogger.eventNamespaceSeparator}${newEvent.eventName}`;
        }
        if(this.properties) {
            const properties: (undefined | ITelemetryLoggerPropertyBag)[] = [];
            properties.push(this.properties.all);
            if(includeErrorProps) {
                properties.push(this.properties.error);
            }
            for(const props of properties) {
                if(props !== undefined) {
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
            for(const extendedProps of [baseLogger.properties, properties]) {
                if(extendedProps !== undefined) {
                    if(extendedProps.all !== undefined) {
                        combinedProperties.all = {
                            ... combinedProperties.all,
                            ... extendedProps.all,
                        };
                    }
                    if(extendedProps.error !== undefined) {
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
        namespace?: string,
        properties?: ITelemetryLoggerPropertyBags) {
        super(namespace, properties);
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
        private readonly markers: IPerformanceEventMarkers = {end: true, cancel: "generic"},
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
            this.reportEvent("cancel", {category: this.markers.cancel, ...props}, error);
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
 * Broad classifications to be applied to individual properties as they're prepared to be logged to telemetry.
 * Please do not modify existing entries for backwards compatibility.
 */
export enum TelemetryDataTag {
    /** Data containing terms from code packages that may have been dynamically loaded */
    PackageData = "PackageData",
    /** Personal data of a variety of classifications that pertains to the user */
    UserData = "UserData",
}

/**
 * Type guard to identify if a particular value (loosely) appears to be a tagged telemetry property
 */
export function isTaggedTelemetryPropertyValue(x: any): x is ITaggedTelemetryPropertyType {
    return (typeof(x?.value) !== "object" && typeof(x?.tag) === "string");
}

/**
 * Read-Write Logging Error.  Not exported.
 * This type alias includes addTelemetryProperties, and applies to objects even if not instanceof LoggingError\
 */
type RwLoggingError = LoggingError;

/** Type guard for RwLoggingError.  Not exported. */
const isRwLoggingError = (x: any): x is RwLoggingError =>
    typeof x?.addTelemetryProperties === "function" && isILoggingError(x);

function extractLogSafeErrorProperties(error: any) {
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

/**
 * Take an unknown error object and extract certain known properties to be included in a new error object.
 * The stack is preserved, along with any safe-to-log telemetry props.
 * @param error - An error that was presumably caught, thrown from unknown origins
 * @param newErrorFn - callback that will create a new error given the original error's message
 * @returns A new error object "wrapping" the given error
 */
 export function wrapError<T>(
    error: any,
    newErrorFn: (m: string) => T,
): T {
    const {
        message,
        stack,
    } = extractLogSafeErrorProperties(error);
    const props = isILoggingError(error) ? error.getTelemetryProperties() : {};

    const newError = newErrorFn(message);
    mixinTelemetryProps(newError as ExtensibleObject<T>, props);

    if (stack !== undefined) {
        Object.assign(newError, { stack });
    }

    return newError;
}

/**
 * Mixes in the given properties, accessible henceforth via ILoggingError.getTelemetryProperties
 * @returns the same object that was passed in, now also implementing ILoggingError.
 */
export function mixinTelemetryProps<T extends Record<string, unknown>>(
    error: T,
    props: ITelemetryProperties,
): T & ILoggingError {
    assert(isRegularObject(error) && !Object.isFrozen(error), "Cannot mixin Telemetry Props");

    if (isRwLoggingError(error)) {
        error.addTelemetryProperties(props);
        return error;
    }

    // Even though it's not exposed, fully implement RwLoggingError for subsequent calls to mixingTelemetryProps
    const loggingError = error as T & RwLoggingError;

    const propsForError = {...props};
    loggingError.getTelemetryProperties = () => propsForError;
    loggingError.addTelemetryProperties =
        (newProps: ITelemetryProperties) => { copyProps(propsForError, newProps); };

    return loggingError;
}

/**
 * Normalize the given error object yielding a valid Fluid Error
 * @returns The same error object passed in if possible, normalized and with any provided annotations applied
 */
 export function normalizeError(
    error: unknown,
    annotations: {
        props?: ITelemetryProperties,
        errorCodeIfNone?: string,
    } = {},
): IFluidErrorBase {
    // Set up some helpers
    function setErrorTypeIfMissing(builder: Builder<IFluidErrorBase>, errorTypeIfNone: string) {
        if (!hasErrorType(error)) {
            builder.errorType = `none (${errorTypeIfNone})`;
        }
    }
    const fullErrorCodeifNone = annotations.errorCodeIfNone === undefined
        ? "none"
        : `none (${annotations.errorCodeIfNone})`;

    // We'll be sure to set all properties on here before casting to IFluidErrorBase and returning
    let fluidErrorBuilder: Builder<IFluidErrorBase>;

    // If we can't annotate the error, wrap it
    if (!isRegularObject(error) || Object.isFrozen(error)) {
        const errorType = !isRegularObject(error) ? typeof(error) : "wrappedFrozenError";
        const newErrorFn = (errMsg: string) => {
            fluidErrorBuilder = new LoggingError(errMsg, annotations.props) as Builder<IFluidErrorBase>;
            setErrorTypeIfMissing(fluidErrorBuilder, errorType);
            fluidErrorBuilder.fluidErrorCode = fullErrorCodeifNone;
            return fluidErrorBuilder as IFluidErrorBase;
        };
        return wrapError<IFluidErrorBase>(error, newErrorFn);
    }

    // Do we already have a valid Fluid Error?  Then just mixin telemetry props
    if (isFluidError(error)) {
        return annotations.props !== undefined
            ? mixinTelemetryProps(error as ExtensibleObject<IFluidErrorBase>, annotations.props)
            : error;
    }

    // We have a mutable object, not already a valid Fluid Error. Time to fill in the gaps!
    fluidErrorBuilder = error as Builder<IFluidErrorBase>;
    fluidErrorBuilder.fluidErrorCode = fullErrorCodeifNone;

    if (isErrorLike(error)) {
        setErrorTypeIfMissing(fluidErrorBuilder, error.name);
    } else {
        setErrorTypeIfMissing(fluidErrorBuilder, typeof(error));
        fluidErrorBuilder.message = annotations.errorCodeIfNone;
        fluidErrorBuilder.name = "none";
    }

    if (typeof (fluidErrorBuilder.stack) !== "string") {
        fluidErrorBuilder.stack = new Error("<<generated stack>>").stack;
    }

    const fluidError = fluidErrorBuilder as ExtensibleObject<IFluidErrorBase>;
    return annotations.props !== undefined
        ? mixinTelemetryProps(fluidError, annotations.props)
        : fluidError;
}

/** Copy props from source onto target, overwriting any keys that are already set on target */
function copyProps(target: unknown, source: ITelemetryProperties) {
    Object.assign(target, source);
}

/**
 * Walk an object's enumerable properties to find those fit for telemetry.
 */
function getValidTelemetryProps(obj: any): ITelemetryProperties {
    const props: ITelemetryProperties = {};
    for (const key of Object.keys(obj)) {
        const val = obj[key];
        switch (typeof val) {
            case "string":
            case "number":
            case "boolean":
            case "undefined":
                props[key] = val;
                break;
            default: {
                if (isTaggedTelemetryPropertyValue(val)) {
                    props[key] = val;
                } else {
                    // We don't support logging arbitrary objects
                    props[key] = "REDACTED (arbitrary object)";
                }
                break;
            }
        }
    }
    return props;
}

/**
 * Helper class for error tracking that can be used to log an error in telemetry.
 * The props passed in (and any set directly on the object after the fact) will be
 * logged in accordance with the given tag, if present.
 *
 * PLEASE take care to properly tag properties set on this object
 */
export class LoggingError extends Error implements ILoggingError {
    constructor(
        message: string,
        props?: ITelemetryProperties,
    ) {
        super(message);
        if (props) {
            this.addTelemetryProperties(props);
        }
    }

    /**
     * Add additional properties to be logged
     */
    public addTelemetryProperties(props: ITelemetryProperties) {
        copyProps(this, props);
    }

    /**
     * Get all properties fit to be logged to telemetry for this error
     */
    public getTelemetryProperties(): ITelemetryProperties {
        const taggableProps = getValidTelemetryProps(this);
        // Include non-enumerable props inherited from Error that would not be returned by getValidTelemetryProps
        // But if any were overwritten (e.g. with a tagged property), then use the result from getValidTelemetryProps.
        // Not including the 'name' property because it's likely always "Error"
        return  {
            stack: this.stack,
            message: this.message,
            ...taggableProps,
        };
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

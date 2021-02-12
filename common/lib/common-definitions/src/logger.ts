/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Examples of known categories, however category can be any string for extensibility
export type TelemetryEventCategory = "generic" | "error" | "performance";

// Logging entire objects is considered extremely dangerous from a telemetry point of view because people
// can easily add fields to objects that shouldn't be logged and not realize it's going to be logged.
// General best practice is to explicitly log the fields you care about from objects
export type TelemetryEventPropertyType = string | number | boolean | undefined;

export interface ITelemetryProperties {
    [index: string]: TelemetryEventPropertyType;
}

/**
 * Base interface for logging telemetry statements.
 * Can contain any number of properties that get serialized as json payload.
 * @param category - category of the event, like "error", "performance", "generic", etc.
 * @param eventName - name of the event.
 */
export interface ITelemetryBaseEvent extends ITelemetryProperties {
    category: string;
    eventName: string;
}

/**
 * Interface to output telemetry events.
 * Implemented by hosting app / loader
 */
export interface ITelemetryBaseLogger {
    send(event: ITelemetryBaseEvent): void;
}

/**
 * Informational (non-error) telemetry event
 * Maps to category = "generic"
 */
export interface ITelemetryGenericEvent extends ITelemetryProperties {
    eventName: string;
    category?: TelemetryEventCategory;
}

/**
 * Error telemetry event.
 * Maps to category = "error"
 */
export type ITelemetryErrorEvent = ITelemetryGenericEvent;

/**
 * Performance telemetry event.
 * Maps to category = "performance"
 */
export interface ITelemetryPerformanceEvent extends ITelemetryGenericEvent {
    duration?: number; // Duration of event (optional)
}

/**
 * ITelemetryLogger interface contains various helper telemetry methods,
 * encoding in one place schemas for various types of Fluid telemetry events.
 * Creates sub-logger that appends properties to all events
 */
export interface ITelemetryLogger extends ITelemetryBaseLogger {
    /**
     * Actual implementation that sends telemetry event
     * Implemented by derived classes
     * @param event - Telemetry event to send over
     */
    send(event: ITelemetryBaseEvent): void;

    /**
     * Send information telemetry event
     * @param event - Event to send
     * @param error - optional error object to log
     */
    sendTelemetryEvent(event: ITelemetryGenericEvent, error?: any): void;

    /**
     * Send error telemetry event
     * @param event - Event to send
     */
    sendErrorEvent(event: ITelemetryErrorEvent, error?: any): void;

    /**
     * Send performance telemetry event
     * @param event - Event to send
     */
    sendPerformanceEvent(event: ITelemetryPerformanceEvent, error?: any): void;

    /**
     * Helper method to log generic errors
     * @param eventName - Name of the event
     * @param error - the error object to include in the event, require to be JSON-able
     */
    logGenericError(eventName: string, error: any): void;

    /**
     * Helper method to log exceptions
     * @param event - the event to send
     * @param exception - Exception object to add to an event
     */
    logException(event: ITelemetryErrorEvent, exception: any): void;

    /**
     * Report ignorable errors in code logic or data integrity.
     * Hosting app / container may want to optimize out these call sites and make them no-op.
     * It may also show assert dialog in non-production builds of application.
     * @param condition - If false, assert is logged.
     * @param message - Actual message to log; ideally should be unique message to identify call site
     */
    debugAssert(condition: boolean, event?: ITelemetryErrorEvent): void;

    /**
     * Report ignorable errors in code logic or data integrity.
     * Similar to debugAssert(), but is not supposed to be optimized out.
     * @param condition - If false, assert is logged.
     * @param message - Actual message to log; ideally should be unique message to identify call site
     */
    shipAssert(condition: boolean, event?: ITelemetryErrorEvent): void;
}

// ////////////////////// fluidError.ts in common-definitions /////////////////////////////
/**
 * Can be decl merged to add stuff like packagename, odspErrorResponse, etc
 * The logger impl can choose to log anything in here as appropriate, but by default it's not
 */
export interface ISensitiveDebugData {
    innerError?: any;
}

export interface IFluidError extends Error {
    errorType: string;
    getFluidTelemetryProps: () => ITelemetryProperties;  //* use property getters?
    getSensitiveDebugData: () => ISensitiveDebugData & { stack: string };
    addDetails: (props: ITelemetryProperties, debugData: ISensitiveDebugData) => void;
}

export const isIFluidError = (err: any): err is IFluidError => (
    typeof(err?.errorType) === "string" &&
    typeof(err?.getFluidTelemetryProps) === "function" && //* Or only check this for brevity/perf?
    typeof(err?.getSensitiveDebugData) === "function" &&
    typeof(err?.addDetails) === "function");

// ////////////////////// fluidError.ts in common-utils /////////////////////////////

export class FluidError extends Error implements IFluidError {
    private props: ITelemetryProperties;
    private debugData: ISensitiveDebugData;
    constructor(
        message: string,
        readonly errorType: string,
        props: ITelemetryProperties,
        debugData: ISensitiveDebugData,
    ) {
        super(message);
        this.props = { ...props, message, errorType };
        this.debugData = { ...debugData };
    }

    public getFluidTelemetryProps() { return { ...this.props }; }
    public getSensitiveDebugData() {
        return { ...this.debugData, stack: this.stack ?? "" };
    } //* Or implement deep copy? Not even possible...?

    public addDetails(props: ITelemetryProperties, debugData: Partial<ISensitiveDebugData>) {
        this.props = { ...this.props, ...props };
        this.debugData = { ...this.debugData, ...debugData };
    }
}

export function wrapAsFluidError(err: any): IFluidError {
    if (isIFluidError(err)) {
        return err;
    }

    //* start with promoting err's message, per present behavior, and then pull out in later scoped change.
    //* Same with stack above?
    return new FluidError(
        "External Error",
        "generic",
        {},
        { innerError: err },
    );
}

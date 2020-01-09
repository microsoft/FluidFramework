/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Examples of known categories, however category can be any string for extensibility
export type TelemetryEventCategory = "generic" | "error" | "activity";

// Logging entire objects is considered extremely dangerous from a telemetry point of view because people
// can easily add fields to objects that shouldn't be logged and not realize it's going to be logged.
// General best practice is to explicitly log the fields you care about from objects
export type TelemetryEventPropertyType = string | number | boolean | undefined;

// Name of the error event property indicating if error was raised through Container.emit("error");
// Presence of this property is a signal to the app not to raise this event to the user second time (if app chooses
// to raise all telemetry errors to user in non-production builds in addition to raising all container events)
export const TelemetryEventRaisedOnContainer = "criticalErrorRaisedOnContainer";

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

export interface IErrorObject {
    message?: string;
    stack?: string;
    getCustomProperties?: () => object;
}

/**
 * A generic activity event that has a duration and success
 * Maps to category = "activity"
 */
export interface ITelemetryActivityEvent extends ITelemetryGenericEvent {
    // Duration of the activity in ms
    durationMs?: number;
    // Overall result of the activity
    succeeded?: boolean;
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
    sendTelemetryEvent(event: ITelemetryGenericEvent): void;

    /**
     * Send activity telemetry event
     * @param event - Event to send
     */
    sendActivityEvent(event: ITelemetryActivityEvent, error?: IErrorObject): void;

    /**
     * Send error telemetry event
     * @param event - Event to send
     */
    sendErrorEvent(event: ITelemetryGenericEvent, error?: IErrorObject): void;

    /**
     * Send potential errors if the condition fails
     * @param condition - If false, error event is logged.
     * @param event - Event to send
     */
    assert(condition: boolean, event?: ITelemetryGenericEvent): void;
}

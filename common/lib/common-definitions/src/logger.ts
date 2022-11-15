/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Examples of known categories, however category can be any string for extensibility.
 */
export type TelemetryEventCategory = "generic" | "error" | "performance";

/**
 * Property types that can be logged.
 *
 * @remarks Logging entire objects is considered extremely dangerous from a telemetry point of view because people can
 * easily add fields to objects that shouldn't be logged and not realize it's going to be logged.
 * General best practice is to explicitly log the fields you care about from objects.
 */
export type TelemetryEventPropertyType = string | number | boolean | undefined;

/**
 * A property to be logged to telemetry containing both the value and a tag. Tags are generic strings that can be used
 * to mark pieces of information that should be organized or handled differently by loggers in various first or third
 * party scenarios. For example, tags are used to mark PII that should not be stored in logs.
 */
export interface ITaggedTelemetryPropertyType {
    value: TelemetryEventPropertyType;
    tag: string;
}

/**
 * JSON-serializable properties, which will be logged with telemetry.
 */
export interface ITelemetryProperties {
    [index: string]: TelemetryEventPropertyType | ITaggedTelemetryPropertyType;
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

export type TelemetryErrorCategory = "verbose" | "information" | "warning" | "error" | "critical";

/**
 * General-use event. These are statically typed events that clients can understand and act on.
 */
export interface ITelemetryGenEventBase extends ITelemetryBaseEvent {
    /*
     * Flag indicating this is general use event.
     * Note: It may seem redundant if we end up emitting general use-events separately.
     * However, it still may be useful if all (dev and general-use) telemetry is routed to a single table.
     */
    genUse: true;
    /*
     * Subtype (Further description in sublasses).
     */
    type: "api" | "service" | "event" | "error";
    /*
     * Package this event was emitted from.
     * It may be useful for consumers to filter out specific packages they are working with.
     */
    packageName: string;
    /*
     * Class name where this event was emitted from.
     * It may be useful for consumers to filter out specific classes they are working with.
     */
    className: string;
    /*
     * Fluid document ID (when applicable). This could be ID, resolved URL etc.
     */
    docId?: string;
    /*
     * Id of a client who generated this telemetry event (when applicable).
     */
    clientId?: string;
}

/**
 * General-use API event. Generated to log a request received by API.
 */
export interface ITelemetryGenApiEvent extends ITelemetryGenEventBase {
    type: "api";
    /*
     * API name that generated this telemetry.
     */
    apiName: string;
    /*
     * Duration of the call.
     */
    duration: number;
    /*
     * Identifier of a request call instance.
     * Used for correlation (TODO) between request and other telemetry items.
     */
    id: string;
    /*
     * Flag indicating if call suceeded or failed.
     */
    success: boolean;
    /*
     * Optional response status.
     */
    status?: string;
    /*
     * JSON stringifed bag od details on the event.
     */
    details?: string;
}

/**
 * General-use Error event. Typically represents an exception that causes an operation to fail.
 */
export interface ITelemetryGenErrorEvent extends ITelemetryGenEventBase {
    type: "error";
    /*
     * Used for exceptions grouping (ex exception type + function).
     */
    errorCode: string;
    /*
     * Optional message.
     */
    message?: string;
    /*
     * Severity level.
     */
    severityLevel: TelemetryErrorCategory;
    /*
     * JSON stringifed stack trace
     */
    stackTrace?: string;
    /*
     * JSON stringifed details on condition(s) leading to this error
     */
    details?: string;
}

/**
 * General-use Service event. Represents a call from FF to an external service or storage.
 */
export interface ITelemetryGenServiceEvent extends ITelemetryGenEventBase {
    type: "service";
    /*
     * Duration of the call.
     */
    duration: number;
    /*
     * Identifier of a dependency call instance (correlation id).
     */
    id?: string;
    /*
     * Target site of a dependency call. Examples are server name, host address (with PII considerations).
     */
    target: string;
    /*
     * Result code. Ex. HTTP status code.
     */
    resultCode: string;
    /*
     * Flag indicating success/failure.
     */
    success: boolean;
}

/**
 * General-use class event - Represents an event firing on a specific object.
 * (Need a better name. "Event" has few different meanings in logger.)
 */
export interface ITelemetryGenClassEvent extends ITelemetryGenEventBase {
    type: "event";
    /*
     * JSON stringifed bag od details on the event.
     */
    details?: string;
}

export type ITelemetryGenEvent =
    | ITelemetryGenApiEvent
    | ITelemetryGenServiceEvent
    | ITelemetryGenErrorEvent
    | ITelemetryGenClassEvent;

/**
 * Interface to output telemetry events.
 * Implemented by hosting app / loader
 */
export interface ITelemetryBaseLogger {
    /**
     * Unstructured dev-only telemetry. Event properties can change across minor or major releases.
     * This stream is inteded to generate telemetry that is actionable to Fluid developers.
     * Implemented by derived classes
     * @param event - Telemetry event to send over
     */
    send(event: ITelemetryBaseEvent): void;

    /**
     * General-use, static telemetry that is meant for general consumption. Events are strongly typed and follow
     * minor/major "breaking" rules.
     * Implemented by derived classes
     * @param event - General-use telemetry event to send over
     */
    sendGenTelemetry?(event: ITelemetryGenEvent): void;
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
export interface ITelemetryErrorEvent extends ITelemetryProperties {
    eventName: string;
}

/**
 * Performance telemetry event.
 * Maps to category = "performance"
 */
export interface ITelemetryPerformanceEvent extends ITelemetryGenericEvent {
    duration?: number; // Duration of event (optional)
}

/**
 * An error object that supports exporting its properties to be logged to telemetry
 */
export interface ILoggingError extends Error {
    /**
     * Return all properties from this object that should be logged to telemetry
     */
    getTelemetryProperties(): ITelemetryProperties;
}

/**
 * ITelemetryLogger interface contains various helper telemetry methods,
 * encoding in one place schemas for various types of Fluid telemetry events.
 * Creates sub-logger that appends properties to all events
 */
export interface ITelemetryLogger extends ITelemetryBaseLogger {
    /**
     * Send information telemetry event
     * @param event - Event to send
     * @param error - optional error object to log
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendTelemetryEvent(event: ITelemetryGenericEvent, error?: any): void;

    /**
     * Send error telemetry event
     * @param event - Event to send
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendErrorEvent(event: ITelemetryErrorEvent, error?: any): void;

    /**
     * Send performance telemetry event
     * @param event - Event to send
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendPerformanceEvent(event: ITelemetryPerformanceEvent, error?: any): void;
}

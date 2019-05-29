export type telemetryEventCategory = "telemetryEvent" | "error";
/**
 * Base interface for logging telemetry statements.
 * Can contain any number of properties that get serialized as json payload.
 * @param category - category of the event, like "error", "performance", "generic", etc.
 * @param eventName - name of the event.
 */
export interface ITelemetryBaseEvent {
    category: telemetryEventCategory;
    eventName: string;
    [index: string]: string | number | boolean;
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
 * Maps to category = "telemetryEvent"
 */
export interface ITelemetryInformationalEvent {
    eventName: string;
    [index: string]: string | number | boolean;
}

/**
 * Error telemetry event.
 * Maps to category = "error"
 */
export interface ITelemetryErrorEvent {
    eventName: string;
    [index: string]: string | number | boolean;
}

/**
 * ITelemetryLogger interface contains various helper telemetry methods,
 * encoding in one place schemas for various types of Prague telemetry events.
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
     */
    sendTelemetryEvent(event: ITelemetryInformationalEvent): void;

    /**
     * Send error telemetry event
     * @param event - Event to send
     */
    sendError(event: ITelemetryErrorEvent): void;

    /**
     * Helper method to log exceptions
     * @param eventName - Name of the event
     * @param exception - Exception to log
     */
    logException(eventName: string, exception: any): void;

    /**
     * Report ignorable errors in code logic or data integrity.
     * Hosting app / container may want to optimize out these call sites and make them no-op.
     * It may also show assert dialog in non-production builds of application.
     * @param condition - If false, assert is logged.
     * @param message - Actual message to log; ideally should be unique message to identify call site
     */
    debugAssert(condition: boolean, message: string): void;

    /**
     * Report ignorable errors in code logic or data integrity.
     * Similar to debugAssert(), but is not supposed to be optimized out.
     * @param condition - If false, assert is logged.
     * @param message - Actual message to log; ideally should be unique message to identify call site
     */
    shipAssert(condition: boolean, message: string): void;
}

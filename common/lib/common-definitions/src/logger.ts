/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Examples of known categories, however category can be any string for extensibility.
 *
 * @deprecated Moved to the `@fluidframework/core-interfaces` package.
 * @internal
 */
export type TelemetryEventCategory = "generic" | "error" | "performance";

/**
 * Property types that can be logged.
 *
 * @remarks Logging entire objects is considered extremely dangerous from a telemetry point of view because people can
 * easily add fields to objects that shouldn't be logged and not realize it's going to be logged.
 * General best practice is to explicitly log the fields you care about from objects.
 *
 * @deprecated Moved to the `@fluidframework/core-interfaces` package.
 * @alpha
 */
export type TelemetryEventPropertyType = string | number | boolean | undefined;

/**
 * A property to be logged to telemetry containing both the value and a tag. Tags are generic strings that can be used
 * to mark pieces of information that should be organized or handled differently by loggers in various first or third
 * party scenarios. For example, tags are used to mark data that should not be stored in logs for privacy reasons.
 *
 * @deprecated Moved to the `@fluidframework/core-interfaces` package.
 * @alpha
 */
export interface ITaggedTelemetryPropertyType {
	value: TelemetryEventPropertyType;
	tag: string;
}

/**
 * JSON-serializable properties, which will be logged with telemetry.
 *
 * @deprecated Moved to the `@fluidframework/core-interfaces` package.
 * @alpha
 */
export interface ITelemetryProperties {
	[index: string]: TelemetryEventPropertyType | ITaggedTelemetryPropertyType;
}

/**
 * Base interface for logging telemetry statements.
 * Can contain any number of properties that get serialized as json payload.
 * @param category - category of the event, like "error", "performance", "generic", etc.
 * @param eventName - name of the event.
 *
 * @deprecated Moved to the `@fluidframework/core-interfaces` package.
 * @internal
 */
export interface ITelemetryBaseEvent extends ITelemetryProperties {
	category: string;
	eventName: string;
}

/**
 * Interface to output telemetry events.
 * Implemented by hosting app / loader
 *
 * @deprecated Moved to the `@fluidframework/core-interfaces` package.
 * @internal
 */
export interface ITelemetryBaseLogger {
	send(event: ITelemetryBaseEvent): void;
}

/**
 * Informational (non-error) telemetry event
 * Maps to category = "generic"
 *
 * @deprecated Moved to the `@fluidframework/core-interfaces` package.
 * @internal
 */
export interface ITelemetryGenericEvent extends ITelemetryProperties {
	eventName: string;
	category?: TelemetryEventCategory;
}

/**
 * Error telemetry event.
 * Maps to category = "error"
 *
 * @deprecated Moved to the `@fluidframework/core-interfaces` package.
 * @internal
 */
export interface ITelemetryErrorEvent extends ITelemetryProperties {
	eventName: string;
}

/**
 * Performance telemetry event.
 * Maps to category = "performance"
 *
 * @deprecated Moved to the `@fluidframework/core-interfaces` package.
 * @internal
 */
export interface ITelemetryPerformanceEvent extends ITelemetryGenericEvent {
	duration?: number; // Duration of event (optional)
}

/**
 * An error object that supports exporting its properties to be logged to telemetry
 *
 * @deprecated Moved to the `@fluidframework/core-interfaces` package.
 * @internal
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
 *
 * @deprecated Moved to the `@fluidframework/core-interfaces` package.
 * @internal
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

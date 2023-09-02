/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Examples of known categories, however category can be any string for extensibility.
 *
 * @deprecated Moved to \@fluidframework/telemetry-utils package
 */
export type TelemetryEventCategory = "generic" | "error" | "performance";

/**
 * Property types that can be logged.
 *
 * @remarks Logging entire objects is considered extremely dangerous from a telemetry point of view because people can
 * easily add fields to objects that shouldn't be logged and not realize it's going to be logged.
 * General best practice is to explicitly log the fields you care about from objects.
 */
export type TelemetryBaseEventPropertyType = TelemetryEventPropertyType;

/**
 * {@inheritDoc TelemetryBaseEventPropertyType}
 *
 * @deprecated Renamed to {@link TelemetryBaseEventPropertyType}
 */
export type TelemetryEventPropertyType = string | number | boolean | undefined;

/**
 * A property to be logged to telemetry may require a tag indicating the value may contain sensitive data.
 * This type wraps a value of the given type V in an object along with a string tag (type can be further specified as T).
 *
 * This indicates that the value should be organized or handled differently by loggers in various first or third
 * party scenarios. For example, tags are used to mark data that should not be stored in logs for privacy reasons.
 */
export interface Tagged<V, T extends string = string> {
	value: V;
	tag: T;
}

/**
 * @see {@link Tagged} for info on tagging
 *
 * @deprecated Use Tagged\<TelemetryBaseEventPropertyType\>
 */
export interface ITaggedTelemetryPropertyType {
	value: TelemetryEventPropertyType;
	tag: string;
}

/**
 * JSON-serializable properties, which will be logged with telemetry.
 */
export type ITelemetryBaseProperties = ITelemetryProperties;

/**
 * {@inheritDoc ITelemetryBaseProperties}
 *
 * @deprecated Renamed to {@link ITelemetryBaseProperties}
 */
export interface ITelemetryProperties {
	[index: string]: TelemetryEventPropertyType | Tagged<TelemetryEventPropertyType>;
}

/**
 * Base interface for logging telemetry statements.
 * Can contain any number of properties that get serialized as json payload.
 * @param category - category of the event, like "error", "performance", "generic", etc.
 * @param eventName - name of the event.
 */
export interface ITelemetryBaseEvent extends ITelemetryBaseProperties {
	category: string;
	eventName: string;
}

/**
 * Enum to specify a level to the log to filter out logs based on the level.
 */
export const enum LogLevel {
	verbose = 10, // To log any verbose event for example when you are debugging something.
	default = 20, // Default log level
	error = 30, // To log errors.
}

/**
 * Interface to output telemetry events.
 * Implemented by hosting app / loader
 */
export interface ITelemetryBaseLogger {
	send(event: ITelemetryBaseEvent, logLevel?: LogLevel): void;

	minLogLevel?: LogLevel;
}

/**
 * Informational (non-error) telemetry event
 * Maps to category = "generic"
 *
 * @deprecated For internal use within FluidFramework, use ITelemetryGenericEventExt in \@fluidframework/telemetry-utils.
 * No replacement intended for FluidFramework consumers.
 */
export interface ITelemetryGenericEvent extends ITelemetryProperties {
	eventName: string;
	category?: TelemetryEventCategory;
}

/**
 * Error telemetry event.
 * Maps to category = "error"
 *
 * @deprecated For internal use within FluidFramework, use ITelemetryErrorEventExt in \@fluidframework/telemetry-utils.
 * No replacement intended for FluidFramework consumers.
 */
export interface ITelemetryErrorEvent extends ITelemetryProperties {
	eventName: string;
}

/**
 * Performance telemetry event.
 * Maps to category = "performance"
 *
 * @deprecated For internal use within FluidFramework, use ITelemetryPerformanceEventExt in \@fluidframework/telemetry-utils.
 * No replacement intended for FluidFramework consumers.
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
	getTelemetryProperties(): ITelemetryBaseProperties;
}

/**
 * ITelemetryLogger interface contains various helper telemetry methods,
 * encoding in one place schemas for various types of Fluid telemetry events.
 * Creates sub-logger that appends properties to all events
 *
 * @deprecated For internal use within FluidFramework, use ITelemetryLoggerExt in \@fluidframework/telemetry-utils.
 * No replacement intended for FluidFramework consumers.
 */
export interface ITelemetryLogger extends ITelemetryBaseLogger {
	/**
	 * Actual implementation that sends telemetry event
	 * Implemented by derived classes
	 * @param event - Telemetry event to send over
	 * @param logLevel - optional level of the log.
	 */
	send(event: ITelemetryBaseEvent, logLevel?: LogLevel): void;

	/**
	 * Send information telemetry event
	 * @param event - Event to send
	 * @param error - optional error object to log
	 * @param logLevel - optional level of the log.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	sendTelemetryEvent(
		event: ITelemetryGenericEvent,
		error?: any,
		logLevel?: LogLevel.verbose | LogLevel.default,
	): void;

	/**
	 * Send error telemetry event
	 * @param event - Event to send
	 * @param error - optional error object to log
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	sendErrorEvent(event: ITelemetryErrorEvent, error?: any): void;

	/**
	 * Send performance telemetry event
	 * @param event - Event to send
	 * @param error - optional error object to log
	 * @param logLevel - optional level of the log.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	sendPerformanceEvent(
		event: ITelemetryPerformanceEvent,
		error?: any,
		logLevel?: LogLevel.verbose | LogLevel.default,
	): void;
}

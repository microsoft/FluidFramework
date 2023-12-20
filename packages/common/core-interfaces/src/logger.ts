/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Examples of known categories, however category can be any string for extensibility.
 *
 * @deprecated Moved to \@fluidframework/telemetry-utils package
 * @public
 */
export type TelemetryEventCategory = "generic" | "error" | "performance";

/**
 * Property types that can be logged.
 *
 * @remarks Logging entire objects is considered extremely dangerous from a telemetry point of view because people can
 * easily add fields to objects that shouldn't be logged and not realize it's going to be logged.
 * General best practice is to explicitly log the fields you care about from objects.
 * @alpha
 */
export type TelemetryBaseEventPropertyType = TelemetryEventPropertyType;

/**
 * {@inheritDoc TelemetryBaseEventPropertyType}
 *
 * @deprecated Renamed to {@link TelemetryBaseEventPropertyType}
 * @public
 */
export type TelemetryEventPropertyType = string | number | boolean | undefined;

/**
 * A property to be logged to telemetry may require a tag indicating the value may contain sensitive data.
 * This type wraps a value of the given type V in an object along with a string tag (type can be further specified as T).
 *
 * This indicates that the value should be organized or handled differently by loggers in various first or third
 * party scenarios. For example, tags are used to mark data that should not be stored in logs for privacy reasons.
 * @public
 */
export interface Tagged<V, T extends string = string> {
	value: V;
	tag: T;
}

/**
 * @see {@link Tagged} for info on tagging
 *
 * @deprecated Use Tagged\<TelemetryBaseEventPropertyType\>
 * @internal
 */
export interface ITaggedTelemetryPropertyType {
	value: TelemetryEventPropertyType;
	tag: string;
}

/**
 * JSON-serializable properties, which will be logged with telemetry.
 * @public
 */
export type ITelemetryBaseProperties = ITelemetryProperties;

/**
 * {@inheritDoc ITelemetryBaseProperties}
 *
 * @deprecated Renamed to {@link ITelemetryBaseProperties}
 * @public
 */
export interface ITelemetryProperties {
	[index: string]: TelemetryEventPropertyType | Tagged<TelemetryEventPropertyType>;
}

/**
 * Base interface for logging telemetry statements.
 * Can contain any number of properties that get serialized as json payload.
 * @param category - category of the event, like "error", "performance", "generic", etc.
 * @param eventName - name of the event.
 * @public
 */
export interface ITelemetryBaseEvent extends ITelemetryBaseProperties {
	category: string;
	eventName: string;
}

/**
 * Specify levels of the logs.
 * @public
 */
export const LogLevel = {
	verbose: 10, // To log any verbose event for example when you are debugging something.
	default: 20, // Default log level
	error: 30, // To log errors.
} as const;

/**
 * Specify a level to the log to filter out logs based on the level.
 * @public
 */
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * Interface to output telemetry events.
 * Implemented by hosting app / loader
 * @public
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
 * @public
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
 * @public
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
 * @public
 */
export interface ITelemetryPerformanceEvent extends ITelemetryGenericEvent {
	duration?: number; // Duration of event (optional)
}

/**
 * An error object that supports exporting its properties to be logged to telemetry
 * @internal
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
 * @public
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
	sendTelemetryEvent(
		event: ITelemetryGenericEvent,
		// TODO: Use `unknown` instead (API-Breaking)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		error?: any,
		logLevel?: typeof LogLevel.verbose | typeof LogLevel.default,
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
	sendPerformanceEvent(
		event: ITelemetryPerformanceEvent,
		// TODO: Use `unknown` instead (API-Breaking)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		error?: any,
		logLevel?: typeof LogLevel.verbose | typeof LogLevel.default,
	): void;
}

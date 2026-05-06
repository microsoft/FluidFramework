/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Property types that can be logged.
 *
 * @remarks Logging entire objects is considered extremely dangerous from a telemetry point of view because people can
 * easily add fields to objects that shouldn't be logged and not realize it's going to be logged.
 * General best practice is to explicitly log the fields you care about from objects.
 * @public
 */
export type TelemetryBaseEventPropertyType = string | number | boolean | undefined;

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
 * JSON-serializable properties, which will be logged with telemetry.
 * @public
 */
export interface ITelemetryBaseProperties {
	/**
	 * Properties of a telemetry event. They are string-indexed, and their values restricted to a known set of
	 * types (optionally "wrapped" with {@link Tagged}).
	 */
	[index: string]: TelemetryBaseEventPropertyType | Tagged<TelemetryBaseEventPropertyType>;
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
 *
 * @privateRemarks This interface exists solely for documentation. API Extractor does not
 * propagate TSDoc comments from a const's inline type to API reports, so we define the shape
 * here and use LogLevelConst on the LogLevel const to surface member docs.
 *
 * @public
 */
export interface LogLevelConst {
	/**
	 * Chatty logs useful for debugging.
	 * @remarks They need not be collected in production.
	 */
	readonly verbose: 10;

	/**
	 * Information about the session.
	 * @remarks These logs could be omitted in some sessions if needed (e.g. to reduce overall telemetry volume).
	 * If any are collected from a particular session, all should be.
	 */
	readonly info: 20;

	/**
	 * Essential information about the operation of Fluid.
	 * @remarks It is recommended that these should always be collected, even in production, for diagnostic purposes.
	 */
	readonly essential: 30;

	/**
	 * Default LogLevel
	 * @deprecated Prefer {@link LogLevelConst.info | LogLevel.info} when selecting a level explicitly to preserve prior treatment. Planned to be removed in 3.0.0.
	 * @see {@link https://github.com/microsoft/FluidFramework/issues/26969 | Issue #26969} for removal tracking.
	 */
	readonly default: 20;

	/**
	 * To log errors.
	 * @deprecated Prefer {@link LogLevelConst.essential | LogLevel.essential} when selecting a level. Planned to be removed in 3.0.0.
	 * @see {@link https://github.com/microsoft/FluidFramework/issues/26969 | Issue #26969} for removal tracking.
	 */
	readonly error: 30;
}

/**
 * Provides runtime {@link (LogLevel:type)} values via symbolic names
 * @see {@link LogLevelConst} type.
 * @public
 */
export const LogLevel: LogLevelConst = {
	verbose: 10,
	info: 20,
	essential: 30,
	default: 20,
	error: 30,
};

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
	/**
	 * Log a telemetry event, if it meets the appropriate log-level threshold (see {@link ITelemetryBaseLogger.minLogLevel}).
	 * @param event - The event to log.
	 * @param logLevel - The log level of the event. If undefined, the logLevel should be treated as {@link LogLevelConst.essential | LogLevel.essential}.
	 */
	send(event: ITelemetryBaseEvent, logLevel?: LogLevel): void;

	/**
	 * Minimum log level to be logged.
	 * @defaultValue {@link LogLevelConst.info | LogLevel.info}.
	 */
	minLogLevel?: LogLevel;
}

/**
 * Error telemetry event.
 * Maps to category = "error"
 *
 * @deprecated For internal use within FluidFramework, use ITelemetryErrorEventExt in \@fluidframework/telemetry-utils.
 * No replacement intended for FluidFramework consumers.
 * @public
 */
export interface ITelemetryErrorEvent extends ITelemetryBaseProperties {
	eventName: string;
}

/**
 * An error object that supports exporting its properties to be logged to telemetry
 * @legacy @beta
 */
export interface ILoggingError extends Error {
	/**
	 * Return all properties from this object that should be logged to telemetry
	 */
	getTelemetryProperties(): ITelemetryBaseProperties;
}

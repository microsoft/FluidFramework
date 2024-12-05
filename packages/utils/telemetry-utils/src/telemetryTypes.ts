/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseLogger, LogLevel, Tagged } from "@fluidframework/core-interfaces";

/**
 * The categories FF uses when instrumenting the code.
 *
 * generic - Informational log event
 *
 * error - Error log event, ideally 0 of these are logged during a session
 *
 * performance - Includes duration, and often has _start, _end, or _cancel suffixes for activity tracking
 * @legacy
 * @alpha
 */
export type TelemetryEventCategory = "generic" | "error" | "performance";

/**
 * Property types that can be logged.
 *
 * @remarks
 * Includes extra types beyond {@link @fluidframework/core-interfaces#TelemetryBaseEventPropertyType}, which must be
 * converted before sending to a base logger.
 * @legacy
 * @alpha
 */
export type TelemetryEventPropertyTypeExt =
	| string
	| number
	| boolean
	| undefined
	| (string | number | boolean)[]
	| Record<string, string | number | boolean | undefined | (string | number | boolean)[]>;

/**
 * JSON-serializable properties, which will be logged with telemetry.
 * @legacy
 * @alpha
 */
export type ITelemetryPropertiesExt = Record<
	string,
	TelemetryEventPropertyTypeExt | Tagged<TelemetryEventPropertyTypeExt>
>;

/**
 * Interface for logging telemetry statements.
 * @remarks May contain any number of properties that get serialized as json payload.
 * @param category - category of the event, like "error", "performance", "generic", etc.
 * @param eventName - name of the event.
 *
 * @internal
 */
export interface ITelemetryEventExt extends ITelemetryPropertiesExt {
	/**
	 * {@inheritDoc @fluidframework/core-interfaces#ITelemetryBaseEvent.category}
	 */
	category: string;

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#ITelemetryBaseEvent.eventName}
	 */
	eventName: string;
}

/**
 * Informational (non-error) telemetry event
 * @remarks Maps to category = "generic"
 * @legacy
 * @alpha
 */
export interface ITelemetryGenericEventExt extends ITelemetryPropertiesExt {
	/**
	 * {@inheritDoc @fluidframework/core-interfaces#ITelemetryBaseEvent.eventName}
	 */
	eventName: string;

	/**
	 * Optional event {@link @fluidframework/core-interfaces#ITelemetryBaseEvent.category}.
	 * @defaultValue "generic"
	 */
	category?: TelemetryEventCategory;
}

/**
 * Error telemetry event.
 * @remarks Maps to category = "error"
 * @legacy
 * @alpha
 */
export interface ITelemetryErrorEventExt extends ITelemetryPropertiesExt {
	/**
	 * {@inheritDoc @fluidframework/core-interfaces#ITelemetryBaseEvent.eventName}
	 */
	eventName: string;
}

/**
 * Performance telemetry event.
 * @remarks Maps to category = "performance"
 * @legacy
 * @alpha
 */
export interface ITelemetryPerformanceEventExt extends ITelemetryGenericEventExt {
	/**
	 * Duration of event (optional)
	 */
	duration?: number;
}

/**
 * An extended {@link @fluidframework/core-interfaces#ITelemetryBaseLogger} which allows for more lenient event types.
 *
 * @remarks
 * This interface is meant to be used internally within the Fluid Framework,
 * and `ITelemetryBaseLogger` should be used when loggers are passed between layers.
 * @legacy
 * @alpha
 */
export interface ITelemetryLoggerExt extends ITelemetryBaseLogger {
	/**
	 * Send an information telemetry event.
	 * @param event - Event to send.
	 * @param error - Optional error object to log.
	 * @param logLevel - Optional level of the log. Default: {@link @fluidframework/core-interfaces#LogLevel.default}.
	 */
	sendTelemetryEvent(
		event: ITelemetryGenericEventExt,
		error?: unknown,
		logLevel?: typeof LogLevel.verbose | typeof LogLevel.default,
	): void;

	/**
	 * Send an error telemetry event.
	 * @param event - Event to send.
	 * @param error - Optional error object to log.
	 */
	sendErrorEvent(event: ITelemetryErrorEventExt, error?: unknown): void;

	/**
	 * Send a performance telemetry event.
	 * @param event - Event to send
	 * @param error - Optional error object to log.
	 * @param logLevel - Optional level of the log. Default: {@link @fluidframework/core-interfaces#LogLevel.default}.
	 */
	sendPerformanceEvent(
		event: ITelemetryPerformanceEventExt,
		error?: unknown,
		logLevel?: typeof LogLevel.verbose | typeof LogLevel.default,
	): void;
}

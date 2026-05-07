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
 * @deprecated This type is being removed without a replacement.
 * @see {@link https://github.com/microsoft/FluidFramework/issues/26910 | Issue #26910} for details.
 * @legacy @beta
 */
export type TelemetryEventCategory = "generic" | "error" | "performance";

/**
 * Property types that can be logged.
 *
 * @remarks
 * Includes extra types beyond {@link @fluidframework/core-interfaces#TelemetryBaseEventPropertyType}, which must be
 * converted before sending to a base logger.
 * @legacy @beta
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
 * @legacy @beta
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
 * @deprecated This type is being removed without a replacement.
 * @see {@link https://github.com/microsoft/FluidFramework/issues/26910 | Issue #26910} for details.
 * @legacy @beta
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
 * @deprecated This type is being removed without a replacement.
 * @see {@link https://github.com/microsoft/FluidFramework/issues/26910 | Issue #26910} for details.
 * @legacy @beta
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
 * @deprecated This type is being removed without a replacement.
 * @see {@link https://github.com/microsoft/FluidFramework/issues/26910 | Issue #26910} for details.
 * @legacy @beta
 */
export interface ITelemetryPerformanceEventExt extends ITelemetryGenericEventExt {
	/**
	 * Duration of event (optional)
	 */
	duration?: number;
}

/**
 * This is the externally facing type for a FluidFramework internal telemetry logger wrapper.
 *
 * @remarks
 * The methods if this interface are not to be used directly by consumers and are all
 * deprecated to removed without replacement. This type is not deprecated and will
 * transition to an erased type to handle cases where "internal" `ITelemetryLoggerExt`
 * previously leaked out.
 *
 * @see {@link https://github.com/microsoft/FluidFramework/issues/26910 | Issue #26910} for deprecation and breaking change details.
 *
 * @privateRemarks
 * External APIs taking in an `ITelemetryLoggerExt` ideally should be updated to
 * accept `ITelemetryBaseLogger` instead.
 *
 * @sealed
 * @legacy
 * @beta
 */
export interface ITelemetryLoggerExt extends ITelemetryBaseLogger {
	/**
	 * Send an information telemetry event.
	 * @param event - Event to send.
	 * @param error - Optional error object to log.
	 * @param logLevel - Optional level of the log. If undefined, the logLevel should be treated as {@link @fluidframework/core-interfaces#LogLevel.essential}.
	 * If the event's category is `error`, the logLevel will be upgraded to {@link @fluidframework/core-interfaces#LogLevel.essential}.
	 * @deprecated This method is being removed without a replacement.
	 * @see {@link https://github.com/microsoft/FluidFramework/issues/26910 | Issue #26910} for details.
	 */
	sendTelemetryEvent(
		event: ITelemetryGenericEventExt,
		error?: unknown,
		logLevel?: typeof LogLevel.verbose | typeof LogLevel.info,
	): void;

	/**
	 * Send an error telemetry event.
	 * @param event - Event to send.
	 * @param error - Optional error object to log.
	 * @deprecated This method is being removed without a replacement.
	 * @see {@link https://github.com/microsoft/FluidFramework/issues/26910 | Issue #26910} for details.
	 */
	sendErrorEvent(event: ITelemetryErrorEventExt, error?: unknown): void;

	/**
	 * Send a performance telemetry event.
	 * @param event - Event to send
	 * @param error - Optional error object to log.
	 * @param logLevel - Optional level of the log. If undefined, the logLevel should be treated as {@link @fluidframework/core-interfaces#LogLevel.essential}.
	 * If the event's category is `error`, the logLevel will be upgraded to {@link @fluidframework/core-interfaces#LogLevel.essential}.
	 * @deprecated This method is being removed without a replacement.
	 * @see {@link https://github.com/microsoft/FluidFramework/issues/26910 | Issue #26910} for details.
	 */
	sendPerformanceEvent(
		event: ITelemetryPerformanceEventExt,
		error?: unknown,
		logLevel?: typeof LogLevel.verbose | typeof LogLevel.info,
	): void;
}

/**
 * An extended {@link @fluidframework/core-interfaces#ITelemetryBaseLogger} which allows for more lenient event types.
 *
 * @remarks
 * This interface is meant to be used internally within the Fluid Framework,
 * and `ITelemetryBaseLogger` should be used when loggers are passed between layers.
 * @internal
 */
export interface TelemetryLoggerExt extends ITelemetryBaseLogger {
	/**
	 * Send an information telemetry event.
	 * @param event - Event to send.
	 * @param error - Optional error object to log.
	 * @param logLevel - Optional level of the log. If undefined, the logLevel will be treated as {@link @fluidframework/core-interfaces#LogLevelConst.essential | LogLevel.essential}.
	 * If the event's category is `error`, the logLevel will be upgraded to {@link @fluidframework/core-interfaces#LogLevelConst.essential | LogLevel.essential}.
	 */
	sendTelemetryEvent(
		event: ITelemetryGenericEventExt,
		error?: unknown,
		logLevel?: typeof LogLevel.verbose | typeof LogLevel.info,
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
	 * @param logLevel - Optional level of the log. If undefined, the logLevel will be treated as {@link @fluidframework/core-interfaces#LogLevelConst.essential | LogLevel.essential}.
	 * If the event's category is `error`, the logLevel will be upgraded to {@link @fluidframework/core-interfaces#LogLevelConst.essential | LogLevel.essential}.
	 */
	sendPerformanceEvent(
		event: ITelemetryPerformanceEventExt,
		error?: unknown,
		logLevel?: typeof LogLevel.verbose | typeof LogLevel.info,
	): void;
}

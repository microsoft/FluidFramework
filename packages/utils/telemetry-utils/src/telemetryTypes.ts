/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ITelemetryBaseLogger,
	LogLevel,
	TelemetryEventCategory,
} from "@fluidframework/core-interfaces";

/**
 * Property types that can be logged.
 * Includes extra types beyond TelemetryEventPropertyType (which will be deprecated in favor of this one)
 */
export type TelemetryEventPropertyTypeExt =
	| string
	| number
	| boolean
	| undefined
	| (string | number | boolean)[]
	| {
			[key: string]: // Flat objects can have the same properties as the event itself
			string | number | boolean | undefined | (string | number | boolean)[];
	  };

/**
 * A property to be logged to telemetry containing both the value and a tag. Tags are generic strings that can be used
 * to mark pieces of information that should be organized or handled differently by loggers in various first or third
 * party scenarios. For example, tags are used to mark personal information that should not be stored in logs.
 */
export interface ITaggedTelemetryPropertyTypeExt {
	value: TelemetryEventPropertyTypeExt;
	tag: string;
}

/**
 * JSON-serializable properties, which will be logged with telemetry.
 */
export interface ITelemetryPropertiesExt {
	[index: string]: TelemetryEventPropertyTypeExt | ITaggedTelemetryPropertyTypeExt;
}

/**
 * Interface for logging telemetry statements.
 * Can contain any number of properties that get serialized as json payload.
 * @param category - category of the event, like "error", "performance", "generic", etc.
 * @param eventName - name of the event.
 */
export interface ITelemetryEventExt extends ITelemetryPropertiesExt {
	category: string;
	eventName: string;
}

/**
 * Informational (non-error) telemetry event
 * Maps to category = "generic"
 */
export interface ITelemetryGenericEventExt extends ITelemetryPropertiesExt {
	eventName: string;
	category?: TelemetryEventCategory;
}

/**
 * Error telemetry event.
 * Maps to category = "error"
 */
export interface ITelemetryErrorEventExt extends ITelemetryPropertiesExt {
	eventName: string;
}

/**
 * Performance telemetry event.
 * Maps to category = "performance"
 */
export interface ITelemetryPerformanceEventExt extends ITelemetryGenericEventExt {
	duration?: number; // Duration of event (optional)
}

/**
 * An extended TelemetryLogger interface which allows for more lenient event types.
 * This interface is meant to be used internally within the Fluid Framework,
 * and ITelemetryBaseLogger should be used when loggers are passed between layers.
 */
export interface ITelemetryLoggerExt extends ITelemetryBaseLogger {
	/**
	 * Send information telemetry event
	 * @param event - Event to send
	 * @param error - optional error object to log
	 * @param logLevel - optional level of the log.
	 */
	sendTelemetryEvent(
		event: ITelemetryGenericEventExt,
		error?: unknown,
		logLevel?: LogLevel.verbose | LogLevel.default,
	): void;

	/**
	 * Send error telemetry event
	 * @param event - Event to send
	 * @param error - optional error object to log
	 */
	sendErrorEvent(event: ITelemetryErrorEventExt, error?: unknown): void;

	/**
	 * Send performance telemetry event
	 * @param event - Event to send
	 * @param error - optional error object to log
	 * @param logLevel - optional level of the log.
	 */
	sendPerformanceEvent(
		event: ITelemetryPerformanceEventExt,
		error?: unknown,
		logLevel?: LogLevel.verbose | LogLevel.default,
	): void;
}

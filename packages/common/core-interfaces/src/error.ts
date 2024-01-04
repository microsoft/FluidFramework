/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseProperties } from "./index";

/**
 * Error types the Fluid Framework may report.
 * @alpha
 */
export const FluidErrorTypes = {
	/**
	 * Some error, most likely an exception caught by runtime and propagated to container as critical error
	 */
	genericError: "genericError",

	/**
	 * Throttling error from server. Server is busy and is asking not to reconnect for some time
	 */
	throttlingError: "throttlingError",

	/**
	 * Data loss error detected by Container / DeltaManager. Likely points to storage issue.
	 */
	dataCorruptionError: "dataCorruptionError",

	/**
	 * Error encountered when processing an operation. May correlate with data corruption.
	 */
	dataProcessingError: "dataProcessingError",

	/**
	 * Error indicating an API is being used improperly resulting in an invalid operation.
	 */
	usageError: "usageError",
} as const;

/**
 * @alpha
 */
export type FluidErrorTypes = (typeof FluidErrorTypes)[keyof typeof FluidErrorTypes];

/**
 * Base interface for all errors and warnings emitted the container.
 *
 * @remarks
 *
 * We are in the process of unifying error types across layers of the Framework. For now we have only migrated
 * those from container-definitions. Once fully migrated, this will be a base interface for all errors and
 * warnings emitted by the Fluid Framework. Currently only the container layer is using IErrorBase.
 * Runtime and others will follow soon.
 * @public
 */
export interface IErrorBase extends Partial<Error> {
	/**
	 * A type tag differentiating kinds of errors emitted by the container.
	 *
	 * @see See {@link FluidErrorTypes#genericError} for some common examples.
	 * - container
	 * - runtime
	 * - drivers
	 */
	readonly errorType: string;

	/**
	 * See {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error | Error.message}
	 *
	 * @remarks
	 *
	 * Privacy Note - This is a freeform string that we may not control in all cases (e.g. a dependency throws an error)
	 * If there are known cases where this contains privacy-sensitive data it will be tagged and included in the result
	 * of getTelemetryProperties. When logging, consider fetching it that way rather than straight from this field.
	 */
	readonly message: string;

	/**
	 * See {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/name | Error.name}
	 */
	readonly name?: string;

	/**
	 * See {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/stack | Error.stack}
	 */
	readonly stack?: string;

	/**
	 * Returns all properties of this error object that are fit for logging.
	 * Some may be tagged to indicate they contain some kind of sensitive data.
	 */
	getTelemetryProperties?(): ITelemetryBaseProperties;
}

/**
 * Generic wrapper for an unrecognized/uncategorized error object
 * @internal
 */
export interface IGenericError extends IErrorBase {
	/**
	 * {@inheritDoc IErrorBase.errorType}
	 */
	readonly errorType: typeof FluidErrorTypes.genericError;

	// TODO: Use `unknown` instead (API-Breaking)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	error?: any;
}

/**
 * Error indicating an API is being used improperly resulting in an invalid operation.
 * @internal
 */
export interface IUsageError extends IErrorBase {
	/**
	 * {@inheritDoc IErrorBase.errorType}
	 */
	readonly errorType: typeof FluidErrorTypes.usageError;
}

/**
 * Warning emitted when requests to storage are being throttled
 * @alpha
 */
export interface IThrottlingWarning extends IErrorBase {
	/**
	 * {@inheritDoc IErrorBase.errorType}
	 */
	readonly errorType: typeof FluidErrorTypes.throttlingError;
	readonly retryAfterSeconds: number;
}

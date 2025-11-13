/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseProperties } from "./logger.js";

/**
 * Error types the Fluid Framework may report.
 * @legacy @beta
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
 * @legacy @beta
 */
export type FluidErrorTypes = (typeof FluidErrorTypes)[keyof typeof FluidErrorTypes];

/**
 * New error types that are still in alpha stage. Once stabilized, they will be moved to FluidErrorTypes.
 * @legacy @alpha
 */
export const FluidErrorTypesAlpha = {
	...FluidErrorTypes,
	/**
	 * Error indicating that two Fluid layers are incompatible. For instance, if the Loader layer is
	 * not compatible with the Runtime layer, the container create / load will fail with an error of this type.
	 * In most cases, the layer compatibility validation happens during container load / create causing it to
	 * fail with this error type.
	 * In some cases such as for the Runtime and DataStore layer compatibility, the incompatibility may be detected
	 * during data store loads. In such cases, the data store load will fail with this error type.
	 */
	layerIncompatibilityError: "layerIncompatibilityError",
} as const;

/**
 * @legacy @alpha
 */
export type FluidErrorTypesAlpha =
	(typeof FluidErrorTypesAlpha)[keyof typeof FluidErrorTypesAlpha];

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
 * @legacy @beta
 */
export interface IThrottlingWarning extends IErrorBase {
	/**
	 * {@inheritDoc IErrorBase.errorType}
	 */
	readonly errorType: typeof FluidErrorTypes.throttlingError;
	readonly retryAfterSeconds: number;
}

/**
 * Layer incompatibility error indicating that two Fluid layers are incompatible. For instance, if the Loader layer is
 * not compatible with the Runtime layer, the container will be disposed with this error.
 * @legacy @alpha
 */
export interface ILayerIncompatibilityError extends IErrorBase {
	/**
	 * {@inheritDoc IErrorBase.errorType}
	 */
	readonly errorType: typeof FluidErrorTypesAlpha.layerIncompatibilityError;
	/**
	 * The layer that is reporting the incompatibility.
	 */
	readonly layer: string;
	/**
	 * The layer that is incompatible with the reporting layer.
	 */
	readonly incompatibleLayer: string;
	/**
	 * The package version of the reporting layer.
	 */
	readonly layerVersion: string;
	/**
	 * The package version of the incompatible layer.
	 */
	readonly incompatibleLayerVersion: string;
	/**
	 * The number of months of compatibility requirements between the two layers as per the layer compatibility policy.
	 */
	readonly compatibilityRequirementsInMonths: number;
	/**
	 * The minimum actual difference in months between the release of the two layers.
	 * Note that for layers with package versions older than 2.63.0, the actual difference may be higher than this value
	 * because the difference reported is capped as per 2.63.0 where the compatibility enforcement was introduced.
	 */
	readonly actualDifferenceInMonths: number;
	/**
	 * Additional details about the incompatibility to be used for debugging purposes.
	 */
	readonly details: string;
}

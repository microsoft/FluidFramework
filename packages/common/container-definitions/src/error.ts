/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidErrorTypes, IErrorBase } from "@fluidframework/core-interfaces";

/**
 * Different error types the ClientSession may report out to the Host.
 * @alpha
 */
export const ContainerErrorTypes = {
	...FluidErrorTypes,
	/**
	 * Error indicating an client session has expired. Currently this only happens when GC is allowed on a document and
	 * aids in safely deleting unused objects.
	 */
	clientSessionExpiredError: "clientSessionExpiredError",
} as const;

/**
 * @alpha
 */
export type ContainerErrorTypes = (typeof ContainerErrorTypes)[keyof typeof ContainerErrorTypes];

/**
 * Different error types the Container may report out to the Host.
 *
 * @deprecated ContainerErrorType is being deprecated as a public export. Please use {@link ContainerErrorTypes#clientSessionExpiredError} instead.
 * @internal
 */
export enum ContainerErrorType {
	/**
	 * Some error, most likely an exception caught by runtime and propagated to container as critical error
	 */
	genericError = "genericError",

	/**
	 * Throttling error from server. Server is busy and is asking not to reconnect for some time
	 */
	throttlingError = "throttlingError",

	/**
	 * Data loss error detected by Container / DeltaManager. Likely points to storage issue.
	 */
	dataCorruptionError = "dataCorruptionError",

	/**
	 * Error encountered when processing an operation. May correlate with data corruption.
	 */
	dataProcessingError = "dataProcessingError",

	/**
	 * Error indicating an API is being used improperly resulting in an invalid operation.
	 */
	usageError = "usageError",

	/**
	 * Error indicating an client session has expired. Currently this only happens when GC is allowed on a document and
	 * aids in safely deleting unused objects.
	 */
	clientSessionExpiredError = "clientSessionExpiredError",
}

/**
 * Represents warnings raised on container.
 * @alpha
 */
export interface ContainerWarning extends IErrorBase {
	/**
	 * Whether this error has already been logged. Used to avoid logging errors twice.
	 *
	 * @defaultValue `false`
	 */
	logged?: boolean;
}

/**
 * Represents errors raised on container.
 *
 * @see
 *
 * The following are commonly thrown error types, but `errorType` could be any string.
 *
 * - {@link @fluidframework/core-interfaces#ContainerErrorType}
 *
 * - {@link @fluidframework/driver-definitions#DriverErrorType}
 *
 * - {@link @fluidframework/odsp-driver-definitions#OdspErrorType}
 *
 * - {@link @fluidframework/routerlicious-driver#RouterliciousErrorType}
 * @public
 */
export type ICriticalContainerError = IErrorBase;

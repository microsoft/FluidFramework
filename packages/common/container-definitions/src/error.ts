/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidErrorTypes, IErrorBase } from "@fluidframework/core-interfaces";

/**
 * Different error types the ClientSession may report out to the Host.
 */
export const ContainerErrorTypes = {
	...FluidErrorTypes,
	/**
	 * Error indicating an client session has expired. Currently this only happens when GC is allowed on a document and
	 * aids in safely deleting unused objects.
	 */
	clientSessionExpiredError: "clientSessionExpiredError",
} as const;
export type ContainerErrorTypes = typeof ContainerErrorTypes[keyof typeof ContainerErrorTypes];

/**
 * Represents warnings raised on container.
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
 * - {@link @fluidframework/core-interfaces#ContainerErrorTypes}
 *
 * - {@link @fluidframework/driver-definitions#DriverErrorTypes}
 *
 * - {@link @fluidframework/odsp-driver-definitions#OdspErrorTypes}
 *
 * - {@link @fluidframework/routerlicious-driver#RouterliciousErrorType}
 *
 */
export type ICriticalContainerError = IErrorBase;

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IErrorBase } from "@fluidframework/core-interfaces";
import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";

/**
 * Different error types the ClientSession may report out to the Host.
 * @legacy
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
 * {@inheritDoc (ContainerErrorTypes:variable)}
 * @legacy
 * @alpha
 */
export type ContainerErrorTypes =
	(typeof ContainerErrorTypes)[keyof typeof ContainerErrorTypes];

/**
 * Represents warnings raised on container.
 * @legacy
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
 * @remarks
 *
 * The following are commonly thrown error types, but `errorType` could be any string.
 *
 * - {@link @fluidframework/core-interfaces#FluidErrorTypes}
 *
 * - {@link @fluidframework/driver-definitions#(DriverErrorTypes:variable)}
 *
 * @public
 */
export type ICriticalContainerError = IErrorBase;

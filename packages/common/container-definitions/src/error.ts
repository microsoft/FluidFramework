/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IErrorBase } from "@fluidframework/core-interfaces";

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
 * - {@link @fluidframework/core-interfaces#ContainerErrorType}
 *
 * - {@link @fluidframework/driver-definitions#DriverErrorType}
 *
 * - {@link @fluidframework/odsp-driver-definitions#OdspErrorType}
 *
 * - {@link @fluidframework/routerlicious-driver#RouterliciousErrorType}
 *
 */
export type ICriticalContainerError = IErrorBase;

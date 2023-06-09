/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DriverErrorType, IDriverErrorBase } from "@fluidframework/driver-definitions";
import { IFluidErrorBase, LoggingError } from "@fluidframework/telemetry-utils";
import { DeltaStreamConnectionForbiddenError } from "./network";

/** Error indicating an API is being used improperly resulting in an invalid operation. */
export class UsageError extends LoggingError implements IDriverErrorBase, IFluidErrorBase {
	readonly errorType = DriverErrorType.usageError;
	readonly canRetry = false;

	constructor(message: string) {
		super(message, { usageError: true });
	}
}

export function isDeltaStreamConnectionForbiddenError(
	error: any,
): error is DeltaStreamConnectionForbiddenError {
	return (
		typeof error === "object" &&
		error !== null &&
		error?.errorType === DriverErrorType.deltaStreamConnectionForbidden
	);
}

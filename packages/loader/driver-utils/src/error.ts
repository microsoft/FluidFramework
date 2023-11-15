/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-deprecated
import {
	DriverErrorType,
	DriverErrorTypes,
	IDriverErrorBase,
} from "@fluidframework/driver-definitions";
import { IFluidErrorBase, LoggingError, isFluidError } from "@fluidframework/telemetry-utils";

/** Error indicating an API is being used improperly resulting in an invalid operation. */
export class UsageError extends LoggingError implements IDriverErrorBase, IFluidErrorBase {
	// eslint-disable-next-line import/no-deprecated
	readonly errorType = DriverErrorType.usageError;
	readonly canRetry = false;

	constructor(message: string) {
		super(message, { usageError: true });
	}
}

export function isFileNotFoundOrAccessDeniedError(error: any): boolean {
	return (
		isFluidError(error) && error.errorType === DriverErrorTypes.fileNotFoundOrAccessDeniedError
	);
}

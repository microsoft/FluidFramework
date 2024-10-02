/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DriverErrorTypes,
	IDriverErrorBase,
} from "@fluidframework/driver-definitions/internal";
import { IFluidErrorBase, LoggingError } from "@fluidframework/telemetry-utils/internal";

/**
 * Error indicating an API is being used improperly resulting in an invalid operation.
 * @internal
 */
export class UsageError extends LoggingError implements IDriverErrorBase, IFluidErrorBase {
	readonly errorType = DriverErrorTypes.usageError;
	readonly canRetry = false;

	constructor(message: string) {
		super(message, { usageError: true });
	}
}

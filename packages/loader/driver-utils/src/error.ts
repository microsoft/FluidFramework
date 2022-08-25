/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DriverErrorType, IDriverErrorBase } from "@fluidframework/driver-definitions";
import { IFluidErrorBase, LoggingError } from "@fluidframework/telemetry-utils";

/** Error indicating an API is being used improperly resulting in an invalid operation. */
export class UsageError extends LoggingError implements IDriverErrorBase, IFluidErrorBase {
    readonly errorType = DriverErrorType.usageError;
    readonly canRetry = false;

    constructor(
        message: string,
    ) {
        super(message, { usageError: true });
    }
}

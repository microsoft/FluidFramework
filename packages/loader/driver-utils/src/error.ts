/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidErrorBase, LoggingError } from "@fluidframework/telemetry-utils";

/** Error indicating an API is being used improperly resulting in an invalid operation. */
export class UsageError extends LoggingError implements IFluidErrorBase {
    readonly errorType = "usageError";

    constructor(
        message: string,
    ) {
        super(message, { usageError: true });
    }
}

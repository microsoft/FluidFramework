/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DriverErrorType } from "@fluidframework/driver-definitions";

/**
 * Checks if the error is domain move error.
 * @param error - error whose type is to be determined.
 * @returns - True is the error is domain move error.
 */
export function isDomainMoveError(error: any) {
    if (typeof error === "object" && error !== null
        && error.errorType === DriverErrorType.locationRedirection) {
        return true;
    }
    return false;
}

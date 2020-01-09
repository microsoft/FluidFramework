/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable: no-unsafe-any
import { ErrorOrWarningType, IErrorOrWarning } from "@microsoft/fluid-driver-definitions";
import { NetworkError, ThrottlingError } from "./network";

/**
 * Convert the error into one of the error types or warnings.
 * Conversion to warning will be added once the warning are emitted from container.
 * @param error - Error to be converted.
 */
export function createContainerError(error: any): IErrorOrWarning {
    let specificError;
    if (error instanceof NetworkError || error instanceof ThrottlingError) {
        specificError = {
            ...error.getCustomProperties(),
        };
    } else {
        specificError = {
            type: ErrorOrWarningType.generalError,
            error,
        };
    }
    return specificError;
}

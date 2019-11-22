/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable: no-unsafe-any
import { ErrorOrWarningType, IErrorOrWarning } from "@microsoft/fluid-protocol-definitions";
import { NetworkError, ThrottlingError } from "./network";

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

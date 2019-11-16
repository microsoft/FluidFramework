/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable: no-unsafe-any
import { ErrorOrWarningType, IErrorOrWarning, IGeneralError } from "@microsoft/fluid-protocol-definitions";

export function createGeneralError(error: any) {
    const generalError: IGeneralError = {
            containerErrorOrWarningType: ErrorOrWarningType.generalError,
            error,
        };
    return generalError;
}

export function createFileIOOrGeneralError(error: any) {
    let specificError: IErrorOrWarning;
    if (error && typeof error === "object" && error.getCustomProperties) {
        specificError = {
            containerErrorOrWarningType: ErrorOrWarningType.fileioError,
            ...error.getCustomProperties(),
        };
        return specificError;
    } else {
        return createGeneralError(error);
    }
}

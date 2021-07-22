/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILoggingError } from "@fluidframework/common-definitions";

// ///////////////////////////////////////////////////////////////////////// //
//        THIS CODE TO BE MOVED TO COMMON-DEFINITIONS AND COMMON-UTILS       //
// ///////////////////////////////////////////////////////////////////////// //

interface IFluidErrorMetadata {
    errorType: string;
    fluidErrorCode: string;
}

/**
 * All normalized errors flowing through the Fluid Framework adhere to this readonly interface.
 * It includes Error's properties but as optional, plus errorType and fluidErrorCode strings.
 */
export type IFluidErrorBase = Readonly<IFluidErrorMetadata & Partial<Error>>;

/** A Partial and non-readonly version of IFluidErrorBase, for building up an object to meet IFluidErrorBase */
export type IFluidErrorBuilder = Partial<IFluidErrorMetadata> & Partial<Error>;

export function isFluidError(e: any): e is IFluidErrorBase {
    return typeof e?.fluidErrorCode === "string";
}

/** type guard to ensure it has an errorType e.g. via IErrorBase */
export const hasErrorType = (error: any): error is { errorType: string } => {
    return (typeof error?.errorType === "string");
};

/** type guard for ILoggingError interface */
export const isILoggingError = (x: any): x is ILoggingError => typeof x?.getTelemetryProperties === "function";

export const isErrorLike = (x: any): x is Error =>
    typeof(x?.message) === "string" &&
    typeof(x?.name) === "string" &&
    (x?.stack === undefined || typeof(x?.stack) === "string");

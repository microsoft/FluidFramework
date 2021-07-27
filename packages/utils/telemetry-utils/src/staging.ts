/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILoggingError } from "@fluidframework/common-definitions";

// ///////////////////////////////////////////////////////////////////////// //
//        THIS CODE TO BE MOVED TO COMMON-DEFINITIONS AND COMMON-UTILS       //
// ///////////////////////////////////////////////////////////////////////// //

/**
 * All normalized errors flowing through the Fluid Framework adhere to this readonly interface.
 * It includes Error's properties but as optional, plus errorType and fluidErrorCode strings.
 */
export interface IFluidErrorBase extends Readonly<Partial<Error>> {
    readonly errorType: string;
    readonly fluidErrorCode: string;
}

/** type guard for IFluidErrorBase interface */
export function isFluidError(e: any): e is IFluidErrorBase {
    return typeof e?.errorType === "string" &&
        typeof e?.fluidErrorCode === "string";
}

/** type guard for old standard of valid/known errors */
export function isOldValidError(e: any): e is Omit<IFluidErrorBase, "fluidErrorCode"> {
    return typeof e?.errorType === "string" &&
        typeof e?.message === "string" &&
        isILoggingError(e);
}

/** type guard for ILoggingError interface */
export const isILoggingError = (x: any): x is ILoggingError => typeof x?.getTelemetryProperties === "function";

/** type guard for the built-in Error type. Safer than using instanceof */
export const isErrorLike = (x: any): x is Error =>
    typeof(x?.message) === "string" &&
    typeof(x?.name) === "string" &&
    (x?.stack === undefined || typeof(x?.stack) === "string");

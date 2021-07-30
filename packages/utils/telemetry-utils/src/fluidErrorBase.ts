/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryProperties } from "@fluidframework/common-definitions";

/** LoggingError interface providing both a getter and setter for telemetry props */
export interface IWriteableLoggingError {
    getTelemetryProperties(): ITelemetryProperties;
    addTelemetryProperties: (props: ITelemetryProperties) => void;
}

/** type guard for IWriteableLoggingError interface */
const isIWriteableLoggingError = (x: any): x is IWriteableLoggingError =>
    typeof x?.getTelemetryProperties === "function" &&
    typeof x?.addTelemetryProperties === "function";

/**
 * All normalized errors flowing through the Fluid Framework adhere to this readonly interface.
 * It features errorType, fluidErrorCode, and message strings, plus Error's members as optional
 * and a getter/setter for telemetry props to be included when the error is logged.
 */
export interface IFluidErrorBase extends Readonly<Partial<Error>>, IWriteableLoggingError {
    readonly errorType: string;
    readonly fluidErrorCode: string;
    readonly message: string;
}

/** type guard for IFluidErrorBase interface */
export function isFluidError(e: any): e is IFluidErrorBase {
    return typeof e?.errorType === "string" &&
        typeof e?.fluidErrorCode === "string" &&
        typeof e?.message === "string" &&
        isIWriteableLoggingError(e);
}

/** type guard for old standard of valid/known errors */
export function isValidLegacyError(e: any): e is Omit<IFluidErrorBase, "fluidErrorCode"> {
    return typeof e?.errorType === "string" &&
        typeof e?.message === "string" &&
        isIWriteableLoggingError(e);
}

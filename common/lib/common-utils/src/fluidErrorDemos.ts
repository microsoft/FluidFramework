/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidError,
    ITelemetryProperties,
    ITelemetryBaseEvent,
} from "@fluidframework/common-definitions";
import { FluidError, wrapAsFluidError, GenericFluidError } from "./fluidError";

// ///////////////// Demo of usage for Driver Errors ///////////////// //
// Compare with packages\loader\driver-definitions\src\driverError.ts
// Compare with packages\loader\driver-utils\src\network.ts

export enum DriverErrorType {
    throttlingError = "driver.throttlingError",
    genericNetworkError = "driver.genericNetworkError",
    authorizationError = "driver.authorizationError",
    fileNotFoundOrAccessDeniedError = "driver.fileNotFoundOrAccessDeniedError",
}

export interface IDriverErrorBase extends IFluidError {
    readonly errorType: DriverErrorType;
    canRetry: boolean;
    online?: string;
}

export interface IThrottlingWarning extends IDriverErrorBase {
    readonly errorType: DriverErrorType.throttlingError;
    readonly retryAfterSeconds: number;
}

export class ThrottlingError extends FluidError implements IThrottlingWarning {
    readonly errorType = DriverErrorType.throttlingError;
    readonly canRetry = true;

    constructor(
        errorMessage: string,
        readonly retryAfterSeconds: number,
        statusCode?: number,
    ) {
        //* As-is, need to include retryAfterSeconds here since we're no longer
        //* just pulling every property off the object but rather keeping them
        //* separated in props. Something to consider.
        super(errorMessage, { retryAfterSeconds, statusCode });
    }
}

// ///////////////// Demo of usage for Container Errors ///////////////// //
// Compare with packages\loader\container-definitions\src\error.ts
// Compare with packages\loader\container-utils\src\error.ts

export enum ContainerErrorType {
    genericError = "container.genericError",
    throttlingError = "container.throttlingError",
    dataCorruptionError = "container.dataCorruptionError",
}

/**
 * Base interface for all errors and warnings at container level
 */
export interface IErrorBase extends IFluidError {
    /** Sequence number when error happened */
    sequenceNumber?: number;
}

/**
 * Represents errors raised on container.
 */
export type ICriticalContainerError = IErrorBase;

/**
 * Convert the error into one of the error types.
 * @param error - Error to be converted.
 */
export function CreateContainerError(error: any): ICriticalContainerError {
    // assert(error !== undefined);

    const fluidError = wrapAsFluidError(error);
    return fluidError as ICriticalContainerError;
}

// ///////////////// Demo of usage when Logging ///////////////// //
// Compare with packages\utils\telemetry-utils\src\logger.ts

export function prepareErrorObject(event: ITelemetryBaseEvent, error: any, fetchStack: boolean) {
    const fluidError = wrapAsFluidError(error);

    event.stack = fluidError.getSensitiveDebugData().stack;
    event.error = fluidError.message;

    const telemetryProps: ITelemetryProperties = fluidError.getFluidTelemetryProps();
    for (const key of Object.keys(telemetryProps)) {
        if (event[key] === undefined) {
            event[key] = telemetryProps[key];
        }
    }

    // Collect stack if we were not able to extract it from error
    if (event.stack === undefined && fetchStack) {
        //* event.stack = TelemetryLogger.getStack();
    }
}

// ///////////////// Demo of usage of addDetails for PII ///////////////// //
// Compare with packages\runtime\container-runtime\src\dataStoreContext.ts

declare module "@fluidframework/common-definitions" {
    export interface ISensitiveDebugData {
        packageName?: string;
    }
}

export function rejectDeferredRealize(reason: string, packageName: string): never {
    const error = new GenericFluidError(reason, {}, { packageName });
    throw error;
}

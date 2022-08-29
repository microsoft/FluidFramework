/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createOdspNetworkError } from "@fluidframework/odsp-doclib-utils";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { NonRetryableError } from "@fluidframework/driver-utils";
import { OdspError } from "@fluidframework/odsp-driver-definitions";
import { IFluidErrorBase } from "@fluidframework/telemetry-utils";
import { IOdspSocketError } from "./contracts";
import { pkgVersion as driverVersion } from "./packageVersion";

/**
 * Returns network error based on error object from ODSP socket (IOdspSocketError)
 */
export function errorObjectFromSocketError(socketError: IOdspSocketError, handler: string):
    IFluidErrorBase & OdspError {
    // Make sure we always return something, and do not throw.
    try {
        // pre-0.58 error message prefix: OdspSocketError
        const message = `ODSP socket error (${handler}): ${socketError.message}`;
        const error = createOdspNetworkError(
            message,
            socketError.code,
            socketError.retryAfter);

        error.addTelemetryProperties({ odspError: true, relayServiceError: true });
        return error;
    } catch (error) {
        return new NonRetryableError(
            "Internal error: errorObjectFromSocketError",
            DriverErrorType.fileNotFoundOrAccessDeniedError,
            { driverVersion });
    }
}

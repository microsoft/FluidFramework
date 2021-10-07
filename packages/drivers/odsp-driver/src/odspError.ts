/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createOdspNetworkError } from "@fluidframework/odsp-doclib-utils";
import { OdspError } from "@fluidframework/odsp-driver-definitions";
import { IOdspSocketError } from "./contracts";

/**
 * Returns network error based on error object from ODSP socket (IOdspSocketError)
 */
export function errorObjectFromSocketError(socketError: IOdspSocketError, handler: string): OdspError {
    const message = `OdspSocketError (${handler}): ${socketError.message}`;
    return createOdspNetworkError(
        "odspSocketError",
        message,
        socketError.code,
        socketError.retryAfter);
}

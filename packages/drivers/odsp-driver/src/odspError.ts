/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createOdspNetworkError } from "@fluidframework/odsp-doclib-utils";
import { IOdspSocketError } from "./contracts";

/**
 * Returns network error based on error object from ODSP socket (IOdspSocketError)
 */
export function errorObjectFromSocketError(socketError: IOdspSocketError, handler: string) {
    const message = `ODSP socket error (${handler}): ${socketError.message}`;
    const error = createOdspNetworkError(
        message,
        socketError.code,
        socketError.retryAfter);

    error.addTelemetryProperties({ odspError: true, relayServiceError: true });

    return error;
}

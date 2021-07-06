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
export function errorObjectFromSocketError(
    socketError: IOdspSocketError,
    handler: string,
    canRetry: boolean,
): OdspError {
    return createOdspNetworkError(
        `socket.io:${handler}`,
        socketError.code,
        canRetry ? socketError.retryAfter : undefined,
        undefined /* response */,
        undefined /* responseText */,
        { socketError: socketError.message } /* props */,
    );
}

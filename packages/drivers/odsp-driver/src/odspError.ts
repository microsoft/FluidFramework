/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { createOdspNetworkError } from "@fluidframework/odsp-doclib-utils";
import { IOdspSocketError } from "./contracts";
import { parseAuthErrorClaims } from "./parseAuthErrorClaims";

const nullToUndefined = (a: string | null) => a ?? undefined;

function numberFromHeader(header: string | null): number | undefined {
    if (header === null) {
        return undefined;
    }
    const n = Number(header);
    if (Number.isNaN(n)) {
        return undefined;
    }
    return n;
}

/**
 * Throws network error - an object with a bunch of network related properties
 */
export function throwOdspNetworkError(
    errorMessage: string,
    statusCode: number,
    response?: Response,
): never {
    const claims = statusCode === 401 && response?.headers ? parseAuthErrorClaims(response.headers) : undefined;

    const networkError = createOdspNetworkError(
        response ? `${errorMessage} (${response.statusText})` : errorMessage,
        statusCode,
        response ? numberFromHeader(response.headers.get("retry-after")) : undefined, // seconds
        claims);

    const errorAsAny = networkError as any;

    if (response) {
        errorAsAny.type = response.type;
        if (response.headers) {
            errorAsAny.sprequestguid = nullToUndefined(response.headers.get("sprequestguid"));
            errorAsAny.serverEpoch = nullToUndefined(response.headers.get("x-fluid-epoch"));
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw networkError;
}

/**
 * Returns network error based on error object from ODSP socket (IOdspSocketError)
 */
export function errorObjectFromSocketError(socketError: IOdspSocketError, handler: string) {
    const message = `socket.io: ${handler}: ${socketError.message}`;
    return createOdspNetworkError(
        message,
        socketError.code,
        socketError.retryAfter,
        // TODO: When long lived token is supported for websocket then IOdspSocketError need to support
        // passing "claims" value that is used to fetch new token
        undefined /* claims */);
}

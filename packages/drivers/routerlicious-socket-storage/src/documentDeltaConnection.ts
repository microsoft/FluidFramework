/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CriticalContainerError, ErrorType } from "@fluidframework/container-definitions";
import { DocumentDeltaConnection } from "@fluidframework/driver-base";
import { IDocumentDeltaConnection } from "@fluidframework/driver-definitions";
import {
    NetworkErrorBasic,
    GenericNetworkError,
    createGenericNetworkError,
} from "@fluidframework/driver-utils";
import { IClient } from "@fluidframework/protocol-definitions";

function createNetworkError(
    errorMessage: string,
    canRetry: boolean,
    statusCode?: number,
    retryAfterSeconds?: number,
): CriticalContainerError {
    let error: CriticalContainerError;

    switch (statusCode) {
        case 401:
        case 403:
            error = new NetworkErrorBasic(errorMessage, ErrorType.authorizationError, canRetry);
            break;
        case 404:
            error = new NetworkErrorBasic(errorMessage, ErrorType.fileNotFoundOrAccessDeniedError, canRetry);
            break;
        case 500:
            error = new GenericNetworkError(errorMessage, canRetry);
            break;
        default:
            error = createGenericNetworkError(errorMessage, canRetry, retryAfterSeconds, statusCode);
    }
    return error;
}

/**
 * Returns specific network error based on error object.
 */
const errorObjectFromSocketError = (socketError: any, canRetry: boolean) => {
    return createNetworkError(
        socketError.message,
        canRetry,
        socketError.code,
        socketError.retryAfter);
};

/**
 * Wrapper over the shared one for driver specific translation.
 */
export class R11sDocumentDeltaConnection extends DocumentDeltaConnection implements IDocumentDeltaConnection {
    public static async create(
        tenantId: string,
        id: string,
        token: string | null,
        io: SocketIOClientStatic,
        client: IClient,
        url: string): Promise<IDocumentDeltaConnection> {
        try {
            const connection = await DocumentDeltaConnection.create(
                tenantId,
                id,
                token,
                io,
                client,
                url,
            );
            return connection;
        } catch (errorObject) {
            // Test if it's a NetworkError. Note that there might be no SocketError on it in case we hit
            // nonrecoverable socket.io protocol errors! So we test canRetry property first - if it false,
            // that means protocol is broken and reconnecting will not help.

            // TODO: Add more cases as we feel appropriate.
            if (errorObject !== null && typeof errorObject === "object" && errorObject.canRetry) {
                const socketError = errorObject.socketError;
                if (typeof socketError === "object" && socketError !== null) {
                    throw errorObjectFromSocketError(socketError, true);
                }
            }
            throw errorObject;
        }
    }
}

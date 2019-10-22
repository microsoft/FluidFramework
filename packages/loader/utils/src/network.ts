/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { INetworkError } from "@microsoft/fluid-protocol-definitions";

/**
 * Network error error class - used to communicate all  network errors
 */
export class NetworkError extends Error implements INetworkError {
    constructor(
            errorMessage: string,
            readonly statusCode: number | undefined,
            readonly canRetry: boolean,
            readonly retryAfterSeconds?: number) {
      super(errorMessage);
    }
}

export function throwNetworkError(
        errorMessage: string,
        statusCode?: number,
        canRetry: boolean = false,
        response?: Response) {
    let message = errorMessage;
    if (response) {
        message = `${message}, msg = ${response.statusText}, type = ${response.type},
            sprequestguid = ${response.headers.get("sprequestguid")}`;
    }
    throw new NetworkError(message, statusCode, canRetry);
}

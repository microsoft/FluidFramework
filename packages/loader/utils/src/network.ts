/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { INetworkError } from "@microsoft/fluid-protocol-definitions";

/**
 * Network error error class - used to communicate all  network errors
 */
export class NetworkError extends Error implements INetworkError {
    public readonly isOnline: boolean;

    constructor(
            errorMessage: string,
            readonly statusCode: number | undefined,
            readonly canRetry: boolean,
            readonly retryAfterSeconds?: number) {
      super(errorMessage);
      this.isOnline = isOnline() === OnlineStatus.Online;
    }
}

export function throwNetworkError(
        errorMessage: string,
        statusCode?: number,
        canRetry: boolean = false,
        response?: Response) {
    let message = errorMessage;
    if (response) {
        message = `${message}, msg = ${response.statusText}, type = ${response.type}`;
    }
    throw new NetworkError(message, statusCode, canRetry);
}

export enum OnlineStatus {
    Offline,
    Online,
    Unknown,
}

// It tells if we have local connection only - we might not have connection to web.
// No solution for node.js (other than resolve dns names / ping specific sites)
// Can also use window.addEventListener("online" / "offline")
export function isOnline(): OnlineStatus {
    if (typeof navigator === "object" && navigator !== null && typeof navigator.onLine === "boolean") {
        return navigator.onLine ? OnlineStatus.Online : OnlineStatus.Offline;
    }
    return OnlineStatus.Unknown;
}

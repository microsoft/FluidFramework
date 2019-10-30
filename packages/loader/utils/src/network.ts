/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { INetworkError } from "@microsoft/fluid-protocol-definitions";

/**
 * Network error error class - used to communicate all  network errors
 */
export class NetworkError extends Error implements INetworkError {

    private readonly customProperties = new Map<string, any>();

    constructor(
            errorMessage: string,
            customProperties: [string, any][]) {
        super(errorMessage);
        for (const [key, val] of customProperties) {
            Object.defineProperty(NetworkError.prototype, key, {
                get: () => {
                    return val;
                },
            });
            this.customProperties.set(key, val);
        }
    }

    public getCustomProperties() {
        const prop = {};
        for (const [key, value] of this.customProperties) {
            prop[key] = value;
        }
        return prop;
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
    throw new NetworkError(message, [
        [INetworkErrorProperties.statusCode , statusCode],
        [INetworkErrorProperties.canRetry, canRetry],
        [INetworkErrorProperties.sprequestguid, response ? `${response.headers.get("sprequestguid")}` : undefined],
    ]);
}

export enum INetworkErrorProperties {
    canRetry = "canRetry",
    statusCode = "statusCode",
    retryAfterSeconds = "retryAfterSeconds",
    sprequestguid = "sprequestguid",
}

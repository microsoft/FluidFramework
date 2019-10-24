/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { INetworkError } from "@microsoft/fluid-protocol-definitions";

/**
 * Network error error class - used to communicate all  network errors
 */
export class NetworkError extends Error implements INetworkError {
    public static checkProperty(error: any, key: string) {
        try {
            if (error && typeof error === "object") {
                const networkError = error as NetworkError;
                return networkError.getProperty(key);
            }
        } catch {}
    }

    private readonly customProperties = new Map<string, any>();

    constructor(
            errorMessage: string,
            customProperties: any[][]) {
      super(errorMessage);
      for (const [key, val] of customProperties) {
          this.customProperties.set(key as string, val);
      }
    }

    public getCustomProperties() {
        return this.customProperties;
    }

    public getProperty(key: string) {
        return this.customProperties.get(key);
    }

    public putProperty(key: string, value: any) {
        this.customProperties.set(key, value);
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

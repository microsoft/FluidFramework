/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { exponentialBackoff, fetchWithRetry, IFetchWithRetryResponse, IRetryPolicy, whitelist } from "./utils";

export interface IFetchWrapper {
    get<T>(url: string, id: string, headers: HeadersInit): Promise<T>;
    post<T>(url: string, postBody: string, headers: HeadersInit): Promise<T>;
}

/**
 * Get responses with retry for requests.
 */
export class FetchWrapper implements IFetchWrapper {
    public retryPolicy: IRetryPolicy;

    constructor(retryPolicy?: IRetryPolicy) {
        if (!retryPolicy) {
            this.retryPolicy = { maxRetries: 5, backoffFn: exponentialBackoff(500), filter: whitelist([503, 500, 408, 409, 429]) };
        } else {
            this.retryPolicy = retryPolicy;
        }
    }

    public async get<T>(url: string, _: string, headers: HeadersInit): Promise<T> {
        const response = await fetchWithRetry(url, { headers }, this.retryPolicy);
        return this.processResponse(response);
    }

    public async post<T>(url: string, postBody: string, headers: HeadersInit): Promise<T> {
        const response = await fetchWithRetry(
            url,
            {
                body: postBody,
                headers,
                method: "POST",
            },
            {
                backoffFn: exponentialBackoff(500),
                filter: whitelist([503, 500, 408, 409, 429]),
                maxRetries: 5,
            });

        return this.processResponse(response);
    }

    public processResponse(response: IFetchWithRetryResponse) {
        if (response.response.status >= 200 && response.response.status < 300) {
            return (response.response.json() as any);
        }

        return Promise.reject(response.response.status);
    }
}

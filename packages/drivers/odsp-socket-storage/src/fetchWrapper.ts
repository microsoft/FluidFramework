/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { exponentialBackoff, fetchWithRetry, whitelist } from "./utils";

export interface IFetchWrapper {
    get<T>(url: string, id: string, headers: HeadersInit): Promise<T>;
    post<T>(url: string, postBody: string, headers: HeadersInit): Promise<T>;
}

/**
 * Get responses with retry for requests.
 */
export class FetchWrapper implements IFetchWrapper {
    public get<T>(url: string, _: string, headers: HeadersInit): Promise<T> {
        return fetchWithRetry(
            url,
            { headers },
            { maxRetries: 5, backoffFn: exponentialBackoff(500), filter: whitelist([503, 500, 408, 409, 429]) },
        ).then((response) => {
            if (response.response.status === 401 || response.response.status === 403) {
                throw response.response.status;
            }
            return (response.response.json() as any) as T;
        });
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

        if (response.response.status === 401 || response.response.status === 403) {
            return Promise.reject(response.response.status);
        }

        return response.response.json();
    }
}

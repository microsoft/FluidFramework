/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { exponentialBackoff, fetchWithRetry, whitelist } from "./utils";

export interface IGetter {
  get<T>(url: string, id: string, headers: HeadersInit): Promise<T>;
}

/**
 * Get responses with retry for requests.
 */
export class HttpGetter implements IGetter {
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
}

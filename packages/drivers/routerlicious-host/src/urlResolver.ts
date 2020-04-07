/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IRequest,
} from "@microsoft/fluid-component-core-interfaces";
import {
    IResolvedUrl,
    IUrlResolver,
} from "@microsoft/fluid-driver-definitions";
import Axios from "axios";

export class ContainerUrlResolver implements IUrlResolver {
    private readonly cache = new Map<string, Promise<IResolvedUrl>>();

    constructor(
        private readonly baseUrl: string,
        private readonly jwt: string,
        cache?: Map<string, IResolvedUrl>,
    ) {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (cache) {
            for (const [key, value] of cache) {
                this.cache.set(key, Promise.resolve(value));
            }
        }
    }

    // This function is handling caching of Promises, not awaiting them.
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public resolve(request: IRequest): Promise<IResolvedUrl> {
        if (!this.cache.has(request.url)) {
            const headers = {
                Authorization: `Bearer ${this.jwt}`,
            };
            const resolvedUrlP = Axios.post<IResolvedUrl>(
                `${this.baseUrl}/api/v1/load`,
                {
                    url: request.url,
                },
                {
                    headers,
                });

            this.cache.set(request.url, resolvedUrlP.then((response) => response.data));
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.cache.get(request.url)!;
    }
}

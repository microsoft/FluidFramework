/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PromiseCache } from "@microsoft/fluid-common-utils";
import {
    IRequest,
} from "@microsoft/fluid-component-core-interfaces";
import {
    IResolvedUrl,
    IUrlResolver,
} from "@microsoft/fluid-driver-definitions";
import { default as Axios, AxiosInstance } from "axios";

export class ContainerUrlResolver implements IUrlResolver {
    private readonly cache = new PromiseCache<string, IResolvedUrl>();

    constructor(
        private readonly baseUrl: string,
        private readonly jwt: string,
        cache?: Map<string, IResolvedUrl>,
        private readonly axios: AxiosInstance = Axios,
    ) {
        if (cache !== undefined) {
            for (const [key, value] of cache) {
                this.cache.addValue(key, value);
            }
        }
    }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const fetchResolvedUrl = async () => {
            const headers = {
                Authorization: `Bearer ${this.jwt}`,
            };
            const resolvedUrl = await this.axios.post<IResolvedUrl>(
                `${this.baseUrl}/api/v1/load`,
                {
                    url: request.url,
                },
                {
                    headers,
                });

            return resolvedUrl.data;
        };

        return this.cache.addOrGet(request.url, fetchResolvedUrl);
    }

    public async getAbsoluteUrl(
        resolvedUrl: IResolvedUrl,
        relativeUrl: string,
    ): Promise<string> {
        throw new Error("Not implmented");
    }
}

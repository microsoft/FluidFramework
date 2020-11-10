/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import { assert, PromiseCache } from "@fluidframework/common-utils";
import {
    IRequest,
} from "@fluidframework/core-interfaces";
import {
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
} from "@fluidframework/driver-definitions";
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
        const fluidResolvedUrl = resolvedUrl as IFluidResolvedUrl;

        const parsedUrl = parse(fluidResolvedUrl.url);
        assert(parsedUrl.pathname !== undefined, "Pathname should be defined");
        const [, tenantId, documentId] = parsedUrl.pathname.split("/");
        assert(documentId !== undefined && tenantId !== undefined);

        let url = relativeUrl;
        if (url.startsWith("/")) {
            url = url.substr(1);
        }
        return `${this.baseUrl}/${encodeURIComponent(
            tenantId)}/${encodeURIComponent(documentId)}${url ? `/${url}` : ``}`;
    }
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
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

/**
 * @deprecated ContainerUrlResolver is not recommended for use and will be removed in an upcoming version.
 */
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
        assert(parsedUrl.pathname !== null, 0x0b7 /* "Pathname should be defined" */);
        const [, tenantId, documentId] = parsedUrl.pathname.split("/");
        assert(!!tenantId && !!documentId,
            0x0b8 /* "'tenantId' and 'documentId' must be defined, non-zero length strings." */);

        let url = relativeUrl;
        if (url.startsWith("/")) {
            url = url.substr(1);
        }
        return `${this.baseUrl}/${encodeURIComponent(
            tenantId)}/${encodeURIComponent(documentId)}${url ? `/${url}` : ``}`;
    }
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { parse } from "url";
import { IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import {
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
    CreateNewHeader,
} from "@microsoft/fluid-driver-definitions";
import {
    ITokenClaims,
    IUser,
} from "@microsoft/fluid-protocol-definitions";
import Axios from "axios";
import * as jwt from "jsonwebtoken";

/**
 * As the name implies this is not secure and should not be used in production. It simply makes the example easier
 * to get up and running.
 *
 * In our example we run a simple web server via webpack-dev-server. This defines a URL format of the form
 * http://localhost:8080/<documentId>/<path>.
 *
 * We then need to map that to a Fluid based URL. These are of the form
 * fluid://orderingUrl/<tenantId>/<documentId>/<path>.
 *
 * The tenantId/documentId pair defines the 'full' document ID the service makes use of. The path is then an optional
 * part of the URL that the document interprets and maps to a component. It's exactly similar to how a web service
 * works or a router inside of a single page app framework.
 */
export class InsecureUrlResolver implements IUrlResolver {
    public readonly isExperimentalUrlResolver = true;
    private readonly cache = new Map<string, Promise<IResolvedUrl>>();

    constructor(
        private readonly hostUrl: string,
        private readonly ordererUrl: string,
        private readonly storageUrl: string,
        private readonly tenantId: string,
        private readonly tenantKey: string,
        private readonly user: IUser,
        private readonly bearer: string,
    ) { }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        if (request.headers?.[CreateNewHeader.createNew]) {
            const [, queryString] = request.url.split("?");

            const searchParams = new URLSearchParams(queryString);
            const fileName = searchParams.get("fileName");
            if (!fileName) {
                throw new Error("FileName should be there!!");
            }
            return this.resolveHelper(fileName);
        }
        const parsedUrl = new URL(request.url);

        // If hosts match then we use the local tenant information. Otherwise we make a REST call out to the hosting
        // service using our bearer token.
        if (parsedUrl.host === window.location.host) {
            const documentId = parsedUrl.pathname.substr(1).split("/")[0];
            return this.resolveHelper(documentId);
        } else {
            const maybeResolvedUrl = this.cache.get(request.url);
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            if (maybeResolvedUrl) {
                return maybeResolvedUrl;
            }

            const headers = {
                Authorization: `Bearer ${this.bearer}`,
            };
            const resolvedP = Axios.post<IResolvedUrl>(
                `${this.hostUrl}/api/v1/load`,
                {
                    url: request.url,
                },
                {
                    headers,
                });
            this.cache.set(request.url, resolvedP.then((resolved) => resolved.data));

            return this.cache.get(request.url);
        }
    }

    private resolveHelper(documentId: string) {
        const encodedTenantId = encodeURIComponent(this.tenantId);
        const encodedDocId = encodeURIComponent(documentId);

        const documentUrl = `fluid://${new URL(this.ordererUrl).host}/${encodedTenantId}/${encodedDocId}`;
        const deltaStorageUrl = `${this.ordererUrl}/deltas/${encodedTenantId}/${encodedDocId}`;
        const storageUrl = `${this.storageUrl}/repos/${encodedTenantId}`;

        const response: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl,
                ordererUrl: this.ordererUrl,
                storageUrl,
            },
            tokens: { jwt: this.auth(this.tenantId, documentId) },
            type: "fluid",
            url: documentUrl,
        };
        return response;
    }

    public async requestUrl(resolvedUrl: IResolvedUrl, request: IRequest): Promise<IResponse> {
        const fluidResolvedUrl = resolvedUrl as IFluidResolvedUrl;

        const parsedUrl = parse(fluidResolvedUrl.url);
        const [, , documentId] = parsedUrl.pathname?.split("/");
        assert(documentId);

        let url = request.url;
        if (url.startsWith("/")) {
            url = url.substr(1);
        }
        const response: IResponse = {
            mimeType: "text/plain",
            value: `${this.hostUrl}/${encodeURIComponent(
                this.tenantId)}/${encodeURIComponent(documentId)}/${url}`,
            status: 200,
        };
        return response;
    }

    public createCreateNewRequest(fileName: string): IRequest {
        const createNewRequest: IRequest = {
            url: `${this.hostUrl}?fileName=${fileName}`,
            headers: {
                [CreateNewHeader.createNew]: true,
            },
        };
        return createNewRequest;
    }

    private auth(tenantId: string, documentId: string) {
        const claims: ITokenClaims = {
            documentId,
            scopes: ["doc:read", "doc:write", "summary:write"],
            tenantId,
            user: this.user,
        };

        return jwt.sign(claims, this.tenantKey);
    }
}

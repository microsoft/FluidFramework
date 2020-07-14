/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { parse } from "url";
import { IRequest } from "@fluidframework/component-core-interfaces";
import {
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
    CreateNewHeader,
} from "@fluidframework/driver-definitions";
import {
    ITokenClaims,
    IUser,
} from "@fluidframework/protocol-definitions";
import jwt from "jsonwebtoken";

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
    constructor(
        private readonly hostUrl: string,
        private readonly ordererUrl: string,
        private readonly storageUrl: string,
        private readonly tenantId: string,
        private readonly tenantKey: string,
        private readonly user: IUser,
        private readonly documentId: string,
    ) { }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const encodedTenantId = encodeURIComponent(this.tenantId);
        const encodedDocId = encodeURIComponent(this.documentId);

        const documentUrl = `fluid://${new URL(this.ordererUrl).host}/${encodedTenantId}/${encodedDocId}`;
        const deltaStorageUrl = `${this.ordererUrl}/deltas/${encodedTenantId}/${encodedDocId}`;
        const storageUrl = `${this.storageUrl}/repos/${encodedTenantId}`;

        const response: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl,
                ordererUrl: this.ordererUrl,
                storageUrl,
            },
            tokens: { jwt: this.auth(this.tenantId, this.documentId) },
            type: "fluid",
            url: documentUrl,
        };
        return response;
    }

    public async getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string> {
        const fluidResolvedUrl = resolvedUrl as IFluidResolvedUrl;

        const parsedUrl = parse(fluidResolvedUrl.url);
        const documentId = parsedUrl.pathname?.split("/")[2];
        assert(documentId);

        let url = relativeUrl;
        if (url.startsWith("/")) {
            url = url.substr(1);
        }

        return `${this.hostUrl}/${encodeURIComponent(
            this.tenantId)}/${encodeURIComponent(documentId)}/${url}`;
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

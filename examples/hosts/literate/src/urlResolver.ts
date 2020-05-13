/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import {
    IFluidResolvedUrl,
    IResolvedUrl,
    ITokenClaims,
    IUrlResolver,
    IUser,
} from "@microsoft/fluid-protocol-definitions";
import jwt from "jsonwebtoken";

/**
 * As the name implies this is not secure and should not be used in production. It simply makes the example easier
 * to get up and running.
 *
 * In our example we run a simple web server via webpack-dev-server. This defines a URL format of the form
 * http://localhost:8080/<documentId>/<path>.
 *
 * We then need to map that to a Prague based URL. These are of the form
 * fluid://orderingUrl/<tenantId>/<documentId>/<path>.
 *
 * The tenantId/documentId pair defines the 'full' document ID the service makes use of. The path is then an optional
 * part of the URL that the document interprets and maps to a component. It's exactlys similar to how a web service
 * works or a router inside of a single page app framework.
 */
export class InsecureUrlResolver implements IUrlResolver {
    constructor(
        private readonly ordererUrl: string,
        private readonly storageUrl: string,
        private readonly tenantId: string,
        private readonly key: string,
        private readonly user: IUser,
    ) { }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const parsedUrl = new URL(request.url);
        const documentId = parsedUrl.pathname.substr(1).split("/")[0];

        const documentUrl = `fluid://${new URL(this.ordererUrl).host}` +
            `/${encodeURIComponent(this.tenantId)}` +
            parsedUrl.pathname;

        const deltaStorageUrl =
            `${this.ordererUrl}/deltas/${encodeURIComponent(this.tenantId)}/${encodeURIComponent(documentId)}`;

        const storageUrl = `${this.storageUrl}/repos/${encodeURIComponent(this.tenantId)}`;

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

    private auth(tenantId: string, documentId: string) {
        const claims: ITokenClaims = {
            documentId,
            scopes: ["doc:read", "doc:write", "summary:write"],
            tenantId,
            user: this.user,
        };

        return jwt.sign(claims, this.key);
    }
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IPragueResolvedUrl,
    IRequest,
    IResolvedUrl,
    ITokenClaims,
    IUrlResolver,
} from "@prague/container-definitions";
import * as jwt from "jsonwebtoken";

export class InsecureUrlResolver implements IUrlResolver {

    constructor(
        private readonly ordererUrl: string,
        private readonly storageUrl: string,
        private readonly user: string,
        private readonly key: string,
    ) { }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        console.log(`resolving url=${JSON.stringify(request)}`);

        // tslint:disable-next-line:no-http-string - Replacing protocol so URL will parse.
        const parsedUrl = new URL(request.url.replace(/^prague:\/\//, "http://"));
        const [tenantId, documentId] = parsedUrl.pathname.substr(1).split("/");

        const documentUrl = `prague://${new URL(this.ordererUrl).host}` +
            `/${encodeURIComponent(tenantId)}` +
            `/${encodeURIComponent(documentId)}`;

        // tslint:disable-next-line:no-unnecessary-local-variable
        const response: IPragueResolvedUrl = {
            ordererUrl: this.ordererUrl,
            storageUrl: this.storageUrl,
            tokens: { jwt: this.auth(tenantId, documentId) },
            type: "prague",
            url: documentUrl,
        };

        return response;
    }

    private auth(tenantId: string, documentId: string) {
        const claims: ITokenClaims = {
            documentId,
            permission: "read:write",
            tenantId,
            user: { id: this.user },
        };

        return jwt.sign(claims, this.key);
    }
}

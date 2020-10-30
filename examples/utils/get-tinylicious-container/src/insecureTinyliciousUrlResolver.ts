/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import {
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
} from "@fluidframework/driver-definitions";
import { ITokenClaims } from "@fluidframework/protocol-definitions";
import { KJUR as jsrsasign } from "jsrsasign";
import { v4 as uuid } from "uuid";
/**
 * InsecureTinyliciousUrlResolver knows how to get the URLs to the service (in this case Tinylicious) to use
 * for a given request.  This particular implementation has a goal to avoid imposing requirements on the app's
 * URL shape, so it expects the request url to have this format (as opposed to a more traditional URL):
 * documentId/containerRelativePathing
 */
export class InsecureTinyliciousUrlResolver implements IUrlResolver {
    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const documentId = request.url.split("/")[0];
        const encodedDocId = encodeURIComponent(documentId);
        const documentRelativePath = request.url.slice(documentId.length);

        const documentUrl = `fluid://localhost:3000/tinylicious/${encodedDocId}${documentRelativePath}`;
        const deltaStorageUrl = `http://localhost:3000/deltas/tinylicious/${encodedDocId}`;
        const storageUrl = `http://localhost:3000/repos/tinylicious`;

        const response: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl,
                ordererUrl: "http://localhost:3000",
                storageUrl,
            },
            tokens: { jwt: this.auth(documentId) },
            type: "fluid",
            url: documentUrl,
        };
        return response;
    }

    public async getAbsoluteUrl(resolvedUrl: IFluidResolvedUrl, relativeUrl: string): Promise<string> {
        const documentId = decodeURIComponent(resolvedUrl.url.replace("fluid://localhost:3000/tinylicious/", ""));
        /*
         * The detached container flow will ultimately call getAbsoluteUrl() with the resolved.url produced by
         * resolve().  The container expects getAbsoluteUrl's return value to be a URL that can then be roundtripped
         * back through resolve() again, and get the same result again.  So we'll return a "URL" with the same format
         * described above.
         */
        return `${documentId}/${relativeUrl}`;
    }

    private auth(documentId: string) {
        const claims: ITokenClaims = {
            documentId,
            scopes: ["doc:read", "doc:write", "summary:write"],
            tenantId: "tinylicious",
            user: { id: uuid() },
            iat: Math.round(new Date().getTime() / 1000),
            exp: Math.round(new Date().getTime() / 1000) + 5 * 60, // 5 minute expiration
            ver: "1.0",
        };

        // The type definition of jsrsasign library is wrong. Remove the casting once fix is available.
        const key: string = ({ utf8: "12345" } as unknown) as string;
        // eslint-disable-next-line no-null/no-null
        return jsrsasign.jws.JWS.sign(null, JSON.stringify({ alg:"HS256", typ: "JWT" }), claims, key);
    }
}

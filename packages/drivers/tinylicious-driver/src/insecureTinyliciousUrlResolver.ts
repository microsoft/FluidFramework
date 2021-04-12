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

export const defaultTinyliciousPort = 7070;

/**
 * InsecureTinyliciousUrlResolver knows how to get the URLs to the service (in this case Tinylicious) to use
 * for a given request.  This particular implementation has a goal to avoid imposing requirements on the app's
 * URL shape, so it expects the request url to have this format (as opposed to a more traditional URL):
 * documentId/containerRelativePathing
 */
export class InsecureTinyliciousUrlResolver implements IUrlResolver {
    public constructor(private readonly tinyliciousPort = defaultTinyliciousPort) { }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const url = request.url.replace(`http://localhost:${this.tinyliciousPort}/`, "");
        const documentId = url.split("/")[0];
        const encodedDocId = encodeURIComponent(documentId);
        const documentRelativePath = url.slice(documentId.length);

        // eslint-disable-next-line max-len
        const documentUrl = `fluid://localhost:${this.tinyliciousPort}/tinylicious/${encodedDocId}${documentRelativePath}`;
        const deltaStorageUrl = `http://localhost:${this.tinyliciousPort}/deltas/tinylicious/${encodedDocId}`;
        const storageUrl = `http://localhost:${this.tinyliciousPort}/repos/tinylicious`;

        const response: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl,
                ordererUrl: `http://localhost:${this.tinyliciousPort}`,
                storageUrl,
            },
            tokens: { jwt: this.auth(documentId) },
            type: "fluid",
            url: documentUrl,
        };
        return response;
    }

    public async getAbsoluteUrl(resolvedUrl: IFluidResolvedUrl, relativeUrl: string): Promise<string> {
        const documentId = decodeURIComponent(
            resolvedUrl.url.replace(`fluid://localhost:${this.tinyliciousPort}/tinylicious/`, ""),
        );
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
            exp: Math.round(new Date().getTime() / 1000) + 60 * 60, // 1 hour expiration
            ver: "1.0",
        };

        const utf8Key = { utf8: "12345" };
        // eslint-disable-next-line no-null/no-null
        return jsrsasign.jws.JWS.sign(null, JSON.stringify({ alg: "HS256", typ: "JWT" }), claims, utf8Key);
    }
}

export const createTinyliciousCreateNewRequest =
    (documentId: string): IRequest => (
        {
            url: documentId,
            headers: {
                createNew: true,
            },
        }
    );

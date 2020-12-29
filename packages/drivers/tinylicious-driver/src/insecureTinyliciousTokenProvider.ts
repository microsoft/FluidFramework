/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType, ITokenClaims } from "@fluidframework/protocol-definitions";
import { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
import { KJUR as jsrsasign } from "jsrsasign";
import { v4 as uuid } from "uuid";

/**
 * As the name implies this is not secure and should not be used in production. It simply makes the example easier
 * to get up and running.
 */
export class InsecureTinyliciousTokenProvider implements ITokenProvider {
    public async fetchOrdererToken(tenantId: string, documentId: string): Promise<ITokenResponse> {
        return {
            fromCache: true,
            jwt: this.getSignedToken(tenantId, documentId),
        };
    }

    public async fetchStorageToken(tenantId: string, documentId: string): Promise<ITokenResponse> {
        return {
            fromCache: true,
            jwt: this.getSignedToken(tenantId, documentId),
        };
    }

    private getSignedToken(
        tenantId: string,
        documentId: string,
        lifetime: number = 60 * 60,
        ver: string = "1.0"): string {
        // Current time in seconds
        const now = Math.round((new Date()).getTime() / 1000);

        const claims: ITokenClaims = {
            documentId,
            scopes: [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
            tenantId,
            user: { id: uuid() },
            iat: now,
            exp: now + lifetime,
            ver,
        };

        const utf8Key = { utf8: "12345" };
        // eslint-disable-next-line no-null/no-null
        return jsrsasign.jws.JWS.sign(null, JSON.stringify({ alg:"HS256", typ: "JWT" }), claims, utf8Key);
    }
}

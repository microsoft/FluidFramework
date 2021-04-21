/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType, ITokenClaims, IUser } from "@fluidframework/protocol-definitions";
import { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
import { KJUR as jsrsasign } from "jsrsasign";

/**
 * As the name implies this is not secure and should not be used in production. It simply makes the example easier
 * to get up and running.
 */
export class InsecureTokenProvider implements ITokenProvider {
    constructor(
        private readonly tenantKey: string,
        private readonly user: IUser,
    ) {

    }

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
            user: this.user,
            iat: now,
            exp: now + lifetime,
            ver,
        };

        const utf8Key = { utf8: this.tenantKey };
        return jsrsasign.jws.JWS.sign(null, JSON.stringify({ alg:"HS256", typ: "JWT" }), claims, utf8Key);
    }
}

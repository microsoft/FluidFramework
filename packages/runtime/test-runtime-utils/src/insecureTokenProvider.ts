/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
        private readonly tenantId: string,
        private readonly documentId: string,
        private readonly tenantKey: string,
        private readonly user: IUser,
    ) {

    }

    public async fetchOrdererToken(): Promise<ITokenResponse> {
        return {
            fromCache: true,
            jwt: this.getSignedToken(),
        };
    }

    public async fetchStorageToken(): Promise<ITokenResponse> {
        return {
            fromCache: true,
            jwt: this.getSignedToken(),
        };
    }

    private getSignedToken(lifetime: number = 60 * 60, ver: string = "1.0"): string {
        // Current time in seconds
        const now = Math.round((new Date()).getTime() / 1000);

        const claims: ITokenClaims = {
            documentId: this.documentId,
            scopes: [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
            tenantId: this.tenantId,
            user: this.user,
            iat: now,
            exp: now + lifetime,
            ver,
        };

        // The type definition of jsrsasign library is wrong. Remove the casting once fix is available.
        const key: string = ({ utf8: this.tenantKey } as unknown) as string;
        return jsrsasign.jws.JWS.sign(null, JSON.stringify({ alg:"HS256", typ: "JWT" }), claims, key);
    }
}

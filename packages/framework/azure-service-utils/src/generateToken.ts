/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITokenClaims, IUser, ScopeType } from "@fluidframework/protocol-definitions";
import { KJUR as jsrsasign } from "jsrsasign";
import { v4 as uuid } from "uuid";

/**
 * Generates a JWT token to authorize routerlicious. This function uses a browser friendly auth library (jsrsasign)
 * and should only be used in client context.
 * If a token ever needs to be generated on the client side, it should re-use this function. If it needs to be used on
 * the service side,  please use the copy available in the server-services-client package in order to avoid
 * interdependencies between service and client packages
 */
export function generateToken(
    tenantId: string,
    key: string,
    scopes: ScopeType[],
    documentId?: string,
    user?: IUser,
    lifetime: number = 60 * 60,
    ver: string = "1.0"): string {
    let userClaim = (user) ? user : generateUser();
    if (userClaim.id === "" || userClaim.id === undefined) {
        userClaim = generateUser();
    }

    // Current time in seconds
    const now = Math.round(Date.now() / 1000);
    const docId = documentId ?? "";

    const claims: ITokenClaims & { jti: string } = {
        documentId: docId,
        scopes,
        tenantId,
        user: userClaim,
        iat: now,
        exp: now + lifetime,
        ver,
        jti: uuid(),
    };

    const utf8Key = { utf8: key };
    return jsrsasign.jws.JWS.sign(null, JSON.stringify({ alg: "HS256", typ: "JWT" }), claims, utf8Key);
}

export function generateUser(): IUser {
    const randomUser = {
        id: uuid(),
        name: uuid(),
    };

    return randomUser;
}

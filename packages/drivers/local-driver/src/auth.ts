/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenClaims, IUser, ScopeType } from "@fluidframework/protocol-definitions";
import { KJUR as jsrsasign } from "jsrsasign";
import { v4 as uuid } from "uuid";
import { getRandomName } from "@fluidframework/server-services-client";

/**
 * Generates a JWT token to authorize against. We do not use the implementation in
 * services-client since it cannot run in the browser without polyfills.
 */
export function generateToken(
    tenantId: string,
    documentId: string,
    key: string,
    scopes: ScopeType[],
    user?: IUser,
    lifetime: number = 60 * 60,
    ver: string = "1.0"): string {
    let userClaim = (user) ? user : generateUser();
    if (userClaim.id === "" || userClaim.id === undefined) {
        userClaim = generateUser();
    }

    // Current time in seconds
    const now = Math.round((new Date()).getTime() / 1000);

    const claims: ITokenClaims = {
        documentId,
        scopes,
        tenantId,
        user: userClaim,
        iat: now,
        exp: now + lifetime,
        ver,
    };

    const utf8Key = { utf8: key };
    return jsrsasign.jws.JWS.sign(null, JSON.stringify({ alg: "HS256", typ: "JWT" }), claims, utf8Key);
}

export function generateUser(): IUser {
    const randomUser = {
        id: uuid(),
        name: getRandomName(" ", true),
    };

    return randomUser;
}

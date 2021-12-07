/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenClaims, IUser, ScopeType } from "@fluidframework/protocol-definitions";
import { KJUR as jsrsasign } from "jsrsasign";
import jwtDecode from "jwt-decode";
import { v4 as uuid } from "uuid";
import { throwR11sServiceNetworkError } from "./error";

/**
 * Validates a JWT token to authorize routerlicious.
 * Throws NetworkError if claims are invalid.
 * @returns - decoded claims.
 */
export function validateTokenClaims(
    token: string,
    documentId: string,
    tenantId: string): ITokenClaims {
    const claims = jwtDecode<ITokenClaims>(token);

    if (!claims || claims.documentId !== documentId || claims.tenantId !== tenantId) {
        throwR11sServiceNetworkError("DocumentId and/or TenantId in token claims do not match requested resource", 403);
    }

    if (claims.scopes === undefined || claims.scopes.length === 0) {
        throwR11sServiceNetworkError("Missing scopes in token claims", 403);
    }

    return claims;
}

/**
 * Validates token claims' iat and exp properties to ensure valid token expiration.
 * Throws NetworkError if expiry is invalid.
 * @returns token lifetime in milliseconds.
 */
export function validateTokenClaimsExpiration(claims: ITokenClaims, maxTokenLifetimeSec: number): number {
    if (!claims.exp || !claims.iat || claims.exp - claims.iat > maxTokenLifetimeSec) {
        throwR11sServiceNetworkError("Invalid token expiry", 403);
    }
    const lifeTimeMSec = (claims.exp * 1000) - (new Date()).getTime();
    if (lifeTimeMSec < 0) {
        throwR11sServiceNetworkError("Expired token", 401);
    }
    return lifeTimeMSec;
}

/**
 * Generates a JWT token to authorize routerlicious. This function uses a browser friendly auth library (jsrsasign)
 * and should only be used in client context.
 */
// TODO: We should use this library in all client code rather than using jsrsasign directly.
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

    const claims: ITokenClaims & { jti: string } = {
        documentId,
        scopes,
        tenantId,
        user: userClaim,
        iat: now,
        exp: now + lifetime,
        ver,
        jti: uuid(),
    };

    const utf8Key = { utf8: key };
    // eslint-disable-next-line no-null/no-null
    return jsrsasign.jws.JWS.sign(null, JSON.stringify({ alg:"HS256", typ: "JWT" }), claims, utf8Key);
}

export function generateUser(): IUser {
    const randomUser = {
        id: uuid(),
        name: uuid(),
    };

    return randomUser;
}

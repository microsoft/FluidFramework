/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenClaims, IUser, ScopeType } from "@fluidframework/protocol-definitions";
import { KJUR as jsrsasign } from "jsrsasign";
import jwtDecode from "jwt-decode";
import { v4 as uuid } from "uuid";
import { NetworkError } from "./error";

/**
 * Validates a JWT token to authorize routerlicious.
 * @returns decoded claims.
 * @throws {NetworkError} if claims are invalid.
 */
export function validateTokenClaims(
    token: string,
    documentId: string,
    tenantId: string): ITokenClaims {
    const claims = jwtDecode<ITokenClaims>(token);

    if (!claims || claims.documentId !== documentId || claims.tenantId !== tenantId) {
        throw new NetworkError(403, "DocumentId and/or TenantId in token claims do not match requested resource");
    }

    if (claims.scopes === undefined || claims.scopes.length === 0) {
        throw new NetworkError(403, "Missing scopes in token claims");
    }

    return claims;
}

/**
 * Validates token claims' iat and exp properties to ensure valid token expiration.
 * @returns token lifetime in milliseconds.
 * @throws {NetworkError} if expiry is invalid.
 */
export function validateTokenClaimsExpiration(claims: ITokenClaims, maxTokenLifetimeSec: number): number {
    if (!claims.exp || !claims.iat || claims.exp - claims.iat > maxTokenLifetimeSec) {
        throw new NetworkError(403, "Invalid token expiry");
    }
    const lifeTimeMSec = (claims.exp * 1000) - (new Date()).getTime();
    if (lifeTimeMSec < 0) {
        throw new NetworkError(401, "Expired token");
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

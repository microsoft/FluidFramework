/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenClaims, IUser, ScopeType } from "@fluidframework/protocol-definitions";
import { KJUR as jsrsasign } from "jsrsasign";
import jwtDecode from "jwt-decode";
import { v4 as uuid } from "uuid";

/**
 * Validates a JWT token to authorize routerlicious and returns decoded claims.
 * An undefined return value indicates invalid claims.
 */
export function validateTokenClaims(
    token: string,
    documentId: string,
    tenantId: string,
    maxTokenLifetimeSec: number,
    isTokenExpiryEnabled: boolean): ITokenClaims {
    const claims = jwtDecode<ITokenClaims>(token);

    if (!claims || claims.documentId !== documentId || claims.tenantId !== tenantId) {
        return undefined;
    }

    if (claims.scopes === undefined || claims.scopes.length === 0) {
        return undefined;
    }

    if (isTokenExpiryEnabled && claims.exp && claims.iat) {
        const now = Math.round((new Date()).getTime() / 1000);
        if (now >= claims.exp || claims.exp - claims.iat > maxTokenLifetimeSec) {
            return undefined;
        }
    }

    return claims;
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
    // eslint-disable-next-line @typescript-eslint/no-use-before-define, no-param-reassign
    user = (user) ? user : generateUser();
    if (user.id === "" || user.id === undefined) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define, no-param-reassign
        user = generateUser();
    }

    // Current time in seconds
    const now = Math.round((new Date()).getTime() / 1000);

    const claims: ITokenClaims = {
        documentId,
        scopes,
        tenantId,
        user,
        iat: now,
        exp: now + lifetime,
        ver,
    };

    // The type definition of jsrsasign library is wrong. Remove the casting once fix is available.
    const utf8Key: string = ({ utf8: key } as unknown) as string;
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

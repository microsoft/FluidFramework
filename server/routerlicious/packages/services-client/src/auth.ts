/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug } from "util";
import { ITokenClaims, IUser, ScopeType } from "@fluidframework/protocol-definitions";
import * as jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { getRandomName } from "./generateNames";

/**
 * Generates a JWT token to authorize routerlicious
 */
export function generateToken(
    tenantId: string,
    documentId: string,
    key: string,
    scopes: ScopeType[],
    user?: IUser): string {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define, no-param-reassign
    user = (user) ? user : generateUser();
    if (user.id === "" || user.id === undefined) {
        debug("User with no id");
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
        exp: now + 5 * 60, // 5 minute expiration window
        ver: "1.0",
    };

    return jwt.sign(claims, key);
}

export function generateUser(): IUser {
    const randomUser = {
        id: uuid(),
        name: getRandomName(" ", true),
    };

    return randomUser;
}

/**
 * Validates a JWT token to authorize routerlicious and returns decoded claims.
 * An undefined return value indicates invalid claims.
 */
export function validateTokenClaims(
    token: string,
    documentId: string,
    tenantId: string,
    isTokenExpiryEnabled: boolean): ITokenClaims {
    const claims = jwt.decode(token) as ITokenClaims;

    const ONE_HOUR = 60 * 60; // 1 hour in seconds
    const now = Math.round((new Date()).getTime() / 1000);
    const isTokenExpired = now < claims.iat || now >= claims.exp || claims.exp - claims.iat > ONE_HOUR;

    if (!claims
        || claims.documentId !== documentId
        || claims.tenantId !== tenantId
        || (isTokenExpiryEnabled && isTokenExpired)
    ) {
        return undefined;
    }
    return claims;
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

 // In this case we want @types/express-serve-static-core, not express-serve-static-core, and so disable the lint rule
// eslint-disable-next-line import/no-unresolved
import { Params } from "express-serve-static-core";
import { ITokenClaims, IUser, ScopeType } from "@fluidframework/protocol-definitions";
import * as jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { ITenantManager } from "@fluidframework/server-services-core";
import { RequestHandler } from "express";
import { Provider } from "nconf";

/**
 * Validates a JWT token to authorize routerlicious and returns decoded claims.
 * An undefined return value indicates invalid claims.
 */
export function validateTokenClaims(
    token: string,
    documentId: string,
    tenantId: string,
    maxTokenLifetimeSec: number,
    isTokenExpiryEnabled: boolean): ITokenClaims | undefined {
    const claims = jwt.decode(token) as ITokenClaims;

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
 * Generates a JWT token to authorize routerlicious. This function uses a large auth library (jsonwebtoken)
 * and should only be used in server context.
 */
// TODO: We should use this library in all server code rather than using jsonwebtoken directly.
export function generateToken(
    tenantId: string,
    documentId: string,
    key: string,
    scopes: ScopeType[],
    user?: IUser,
    lifetime: number = 60 * 60,
    ver: string = "1.0"): string {
    let userClaim = user ? user : generateUser();
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

    return jwt.sign(claims, key);
}

export function generateUser(): IUser {
    const randomUser = {
        id: uuid(),
        name: uuid(),
    };

    return randomUser;
}

/**
 * Verifies the storage token claims and calls riddler to validate the token.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function verifyStorageToken(tenantManager: ITenantManager, config: Provider): RequestHandler {
    return (request, res, next) => {
        const maxTokenLifetimeSec = config.get("auth:maxTokenLifetimeSec") as number;
        const isTokenExpiryEnabled = config.get("auth:enableTokenExpiration") as boolean;
        const authorizationHeader = request.header("Authorization");
        if (!authorizationHeader) {
            return res.status(401).json("Authorization header is missing.");
        }
        const regex = /Basic (.+)/;
        const tokenMatch = regex.exec(authorizationHeader);
        if (!tokenMatch || !tokenMatch[1]) {
            return res.status(401).json("Missing access token.");
        }
        const token = tokenMatch[1];
        const tenantId = getParam(request.params, "tenantId");
        const documentId = getParam(request.params, "id") || request.body.id;
        if (!tenantId || !documentId) {
            return res.status(401).json("TenantId or DocumentId is missing in the access token.");
        }
        const claims = validateTokenClaims(token, documentId, tenantId, maxTokenLifetimeSec, isTokenExpiryEnabled);
        if (!claims) {
            return res.status(401).json("Invalid access token.");
        }
        console.log(`token to verify: ${token}`);
        tenantManager.verifyToken(claims.tenantId, token).catch((error) => {
            return res.status(401).json(error);
        });

        next();
    };
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function getParam(params: Params, key: string) {
    return Array.isArray(params) ? undefined : params[key];
}

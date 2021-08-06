/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// In this case we want @types/express-serve-static-core, not express-serve-static-core, and so disable the lint rule
// eslint-disable-next-line import/no-unresolved
import { Params } from "express-serve-static-core";
import { ITokenClaims, IUser, ScopeType } from "@fluidframework/protocol-definitions";
import * as jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { NetworkError, validateTokenClaimsExpiration } from "@fluidframework/server-services-client";
import type { ITenantManager } from "@fluidframework/server-services-core";
import type { RequestHandler } from "express";
import type { Provider } from "nconf";

/**
 * Validates a JWT token to authorize routerlicious.
 * @returns decoded claims.
 * @throws {NetworkError} if claims are invalid.
 */
export function validateTokenClaims(
    token: string,
    documentId: string,
    tenantId: string,
    ignoreDocumentId = false): ITokenClaims {
    const claims = jwt.decode(token) as ITokenClaims;
    if (!claims) {
        throw new NetworkError(403, "Missing token claims.");
    }

    if (claims.tenantId !== tenantId) {
        throw new NetworkError(403, "TenantId in token claims does not match request.");
    }

    if (!ignoreDocumentId && claims.documentId !== documentId) {
        throw new NetworkError(403, "DocumentId in token claims does not match request.");
    }

    if (claims.scopes === undefined || claims.scopes.length === 0) {
        throw new NetworkError(403, "Missing scopes in token claims.");
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
export function verifyStorageToken(
    tenantManager: ITenantManager,
    config: Provider,
    ignoreDocumentId = false): RequestHandler {
    return (request, res, next) => {
        const maxTokenLifetimeSec = config.get("auth:maxTokenLifetimeSec") as number;
        const isTokenExpiryEnabled = config.get("auth:enableTokenExpiration") as boolean;
        const authorizationHeader = request.header("Authorization");
        if (!authorizationHeader) {
            return res.status(403).send("Missing Authorization header.");
        }
        const regex = /Basic (.+)/;
        const tokenMatch = regex.exec(authorizationHeader);
        if (!tokenMatch || !tokenMatch[1]) {
            return res.status(403).send("Missing access token.");
        }
        const token = tokenMatch[1];
        const tenantId = getParam(request.params, "tenantId");
        if (!tenantId) {
            return res.status(403).send("Missing tenantId in request.");
        }
        const documentId = getParam(request.params, "id") || request.body.id;
        if (!ignoreDocumentId && !documentId) {
            return res.status(403).send("Missing documentId in request");
        }
        let claims: ITokenClaims;
        try {
            claims = validateTokenClaims(token, documentId, tenantId, ignoreDocumentId);
            if (isTokenExpiryEnabled) {
                validateTokenClaimsExpiration(claims, maxTokenLifetimeSec);
            }
        } catch (error) {
            if (error instanceof NetworkError) {
                return res.status(error.code).send(error.message);
            }
            throw error;
        }
        tenantManager.verifyToken(claims.tenantId, token)
            .then(() => {
                next();
            })
            .catch((error) => {
                return res.status(403).json(error);
            });
    };
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function getParam(params: Params, key: string) {
    return Array.isArray(params) ? undefined : params[key];
}

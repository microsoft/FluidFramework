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
import {
    NetworkError,
    isNetworkError,
    validateTokenClaimsExpiration,
} from "@fluidframework/server-services-client";
import type { ICache, ITenantManager } from "@fluidframework/server-services-core";
import type { RequestHandler, Response } from "express";
import type { Provider } from "nconf";
import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";

/**
 * Validates a JWT token to authorize routerlicious.
 * @returns decoded claims.
 * @throws {NetworkError} if claims are invalid.
 */
export function validateTokenClaims(
    token: string,
    documentId: string,
    tenantId: string,
    requireDocumentId = true): ITokenClaims {
    const claims = jwt.decode(token) as ITokenClaims;
    if (!claims) {
        throw new NetworkError(403, "Missing token claims.");
    }

    if (claims.tenantId !== tenantId) {
        throw new NetworkError(403, "TenantId in token claims does not match request.");
    }

    if (requireDocumentId && claims.documentId !== documentId) {
        throw new NetworkError(403, "DocumentId in token claims does not match request.");
    }

    if (claims.scopes === undefined || claims.scopes.length === 0) {
        throw new NetworkError(403, "Missing scopes in token claims.");
    }

    return claims;
}

/**
 * Generates a document creation JWT token, this token doesn't provide any sort of authorization to the user.
 * But it can be used by other services to validate the document creator identity upon creating a document.
 */
export function getCreationToken(token: string, key: string, documentId: string, lifetime = 5 * 60) {
    // Current time in seconds
    const tokenClaims = jwt.decode(token) as ITokenClaims;

    const { tenantId, user } = tokenClaims;

    return generateToken(tenantId, documentId, key, [], user, lifetime);
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

    return jwt.sign(claims, key, { jwtid: uuid() });
}

export function generateUser(): IUser {
    const randomUser = {
        id: uuid(),
        name: uuid(),
    };

    return randomUser;
}

interface IVerifyTokenOptions {
    requireDocumentId: boolean;
    ensureSingleUseToken: boolean;
    singleUseTokenCache: ICache | undefined;
}

export function respondWithNetworkError(
    response: Response,
    error: NetworkError,
): Response {
    return response.status(error.code).json(error.details);
}

/**
 * Verifies the storage token claims and calls riddler to validate the token.
 */
export function verifyStorageToken(
    tenantManager: ITenantManager,
    config: Provider,
    options: IVerifyTokenOptions = {
        requireDocumentId: true,
        ensureSingleUseToken: false,
        singleUseTokenCache: undefined,
    }): RequestHandler {
    return async (request, res, next) => {
        const maxTokenLifetimeSec = config.get("auth:maxTokenLifetimeSec") as number;
        const isTokenExpiryEnabled = config.get("auth:enableTokenExpiration") as boolean;
        const authorizationHeader = request.header("Authorization");
        if (!authorizationHeader) {
            return respondWithNetworkError(res, new NetworkError(403, "Missing Authorization header."));
        }
        const tokenRegex = /Basic (.+)/;
        const tokenMatch = tokenRegex.exec(authorizationHeader);
        if (!tokenMatch || !tokenMatch[1]) {
            return respondWithNetworkError(res, new NetworkError(403, "Missing access token."));
        }
        const token = tokenMatch[1];
        const tenantId = getParam(request.params, "tenantId");
        if (!tenantId) {
            return respondWithNetworkError(res, new NetworkError(403, "Missing tenantId in request."));
        }
        const documentId = getParam(request.params, "id") || request.body.id;
        if (options.requireDocumentId && !documentId) {
            return respondWithNetworkError(res, new NetworkError(403, "Missing documentId in request"));
        }
        let claims: ITokenClaims | undefined;
        let tokenLifetimeMs: number | undefined;
        try {
            claims = validateTokenClaims(token, documentId, tenantId, options.requireDocumentId);
            if (isTokenExpiryEnabled) {
                tokenLifetimeMs = validateTokenClaimsExpiration(claims, maxTokenLifetimeSec);
            }
            await tenantManager.verifyToken(claims.tenantId, token);
        } catch (error) {
            if (isNetworkError(error)) {
                return respondWithNetworkError(res, error);
            }
            // We don't understand the error, so it is likely an internal service error.
            Lumberjack.error(
                "Unrecognized error when validating/verifying request token",
                claims ? getLumberBaseProperties(claims.documentId, claims.tenantId) : undefined,
                error,
            );
            return respondWithNetworkError(res, new NetworkError(500, "Internal server error."));
        }

        if (options.ensureSingleUseToken) {
            // Use token as key for minimum chance of collision.
            const singleUseKey = token;
            // TODO: monitor uptime of services and switch to errors blocking
            // flow if needed to prevent malicious activity
            const cachedSingleUseToken = await options.singleUseTokenCache?.get(singleUseKey).catch((error) => {
                Lumberjack.error(
                    "Unable to retrieve cached single-use JWT",
                    claims ? getLumberBaseProperties(claims.documentId, claims.tenantId) : undefined,
                    error,
                );
                return false;
            });
            if (cachedSingleUseToken) {
                return res.status(403).send("Access token has already been used.");
            }
            options.singleUseTokenCache?.set(
                singleUseKey,
                "used",
                tokenLifetimeMs !== undefined ? Math.floor(tokenLifetimeMs / 1000) : undefined,
            ).catch((error) => {
                Lumberjack.error(
                    "Unable to cache single-use JWT",
                    claims ? getLumberBaseProperties(claims.documentId, claims.tenantId) : undefined,
                    error,
                );
            });
        }
        next();
    };
}

export function getParam(params: Params, key: string) {
    return Array.isArray(params) ? undefined : params[key];
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// In this case we want @types/express-serve-static-core, not express-serve-static-core, and so disable the lint rule
// eslint-disable-next-line import/no-unresolved
import { Params } from "express-serve-static-core";
import { ITokenClaims, IUser, ScopeType } from "@fluidframework/protocol-definitions";
import { decode, sign } from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import {
	NetworkError,
	isNetworkError,
	validateTokenClaimsExpiration,
	canRevokeToken,
	canDeleteDoc,
	TokenRevokeScopeType,
	DocDeleteScopeType,
	getGlobalTimeoutContext,
} from "@fluidframework/server-services-client";
import type {
	ICache,
	IRevokedTokenChecker,
	ITenantManager,
} from "@fluidframework/server-services-core";
import type { RequestHandler, Request, Response } from "express";
import type { Provider } from "nconf";
import {
	getGlobalTelemetryContext,
	getLumberBaseProperties,
	Lumberjack,
} from "@fluidframework/server-services-telemetry";
import { getBooleanFromConfig, getNumberFromConfig } from "./configUtils";

/**
 * Validates a JWT token to authorize routerlicious.
 * @returns decoded claims.
 * @throws {@link NetworkError} if claims are invalid.
 * @internal
 */
export function validateTokenClaims(
	token: string,
	documentId: string,
	tenantId: string,
	requireDocumentId = true,
): ITokenClaims {
	const claims = decode(token) as ITokenClaims;
	if (!claims) {
		throw new NetworkError(403, "Missing token claims.");
	}

	if (claims.tenantId !== tenantId) {
		throw new NetworkError(403, "TenantId in token claims does not match request.");
	}

	if (requireDocumentId && claims.documentId !== documentId) {
		throw new NetworkError(403, "DocumentId in token claims does not match request.");
	}

	if (claims.scopes === undefined || claims.scopes === null || claims.scopes.length === 0) {
		throw new NetworkError(403, "Missing scopes in token claims.");
	}

	return claims;
}

/**
 * Generates a document creation JWT token, this token doesn't provide any sort of authorization to the user.
 * But it can be used by other services to validate the document creator identity upon creating a document.
 * @internal
 */
export function getCreationToken(
	token: string,
	key: string,
	documentId: string,
	lifetime = 5 * 60,
) {
	// Current time in seconds
	const tokenClaims = decode(token) as ITokenClaims;

	const { tenantId, user, jti, ver } = tokenClaims;

	return generateToken(tenantId, documentId, key, [], user, lifetime, ver, jti);
}

/**
 * Generates a JWT token to authorize routerlicious. This function uses a large auth library (jsonwebtoken)
 * and should only be used in server context.
 * @internal
 */
// TODO: We should use this library in all server code rather than using jsonwebtoken directly.
export function generateToken(
	tenantId: string,
	documentId: string,
	key: string,
	scopes: ScopeType[],
	user?: IUser,
	lifetime: number = 60 * 60,
	ver: string = "1.0",
	jti: string = uuid(),
): string {
	let userClaim = user ? user : generateUser();
	if (userClaim.id === "" || userClaim.id === undefined) {
		userClaim = generateUser();
	}

	// Current time in seconds
	const now = Math.round(new Date().getTime() / 1000);

	const claims: ITokenClaims = {
		documentId,
		scopes,
		tenantId,
		user: userClaim,
		iat: now,
		exp: now + lifetime,
		ver,
	};

	return sign(claims, key, { jwtid: jti });
}

/**
 * @internal
 */
export function generateUser(): IUser {
	const randomUser = {
		id: uuid(),
		name: uuid(),
	};

	return randomUser;
}

interface IVerifyTokenOptions {
	requireDocumentId: boolean;
	requireTokenExpiryCheck?: boolean;
	maxTokenLifetimeSec?: number;
	ensureSingleUseToken: boolean;
	singleUseTokenCache: ICache | undefined;
	enableTokenCache: boolean;
	tokenCache: ICache | undefined;
	revokedTokenChecker: IRevokedTokenChecker | undefined;
}

/**
 * @internal
 */
export function respondWithNetworkError(response: Response, error: NetworkError): Response {
	return response.status(error.code).json(error.details);
}

function getTokenFromRequest(request: Request): string {
	const authorizationHeader = request.header("Authorization");
	if (!authorizationHeader) {
		throw new NetworkError(403, "Missing Authorization header.");
	}
	const tokenRegex = /Basic (.+)/;
	const tokenMatch = tokenRegex.exec(authorizationHeader);
	if (!tokenMatch?.[1]) {
		throw new NetworkError(403, "Missing access token.");
	}
	return tokenMatch[1];
}

const defaultMaxTokenLifetimeSec = 60 * 60; // 1 hour

/**
 * @internal
 */
export async function verifyToken(
	tenantId: string,
	documentId: string,
	token: string,
	tenantManager: ITenantManager,
	options: IVerifyTokenOptions,
): Promise<void> {
	if (options.requireDocumentId && !documentId) {
		throw new NetworkError(403, "Missing documentId.");
	}

	let tokenLifetimeMs: number | undefined;
	const logProperties = getLumberBaseProperties(documentId, tenantId);
	try {
		const claims = validateTokenClaims(token, documentId, tenantId, options.requireDocumentId);
		if (options.requireTokenExpiryCheck) {
			let maxTokenLifetimeSec = options.maxTokenLifetimeSec;
			if (!maxTokenLifetimeSec) {
				Lumberjack.error(
					`Missing/Invalid maxTokenLifetimeSec=${maxTokenLifetimeSec} in options. Set to default=${defaultMaxTokenLifetimeSec}`,
					logProperties,
				);
				maxTokenLifetimeSec = defaultMaxTokenLifetimeSec;
			}
			tokenLifetimeMs = validateTokenClaimsExpiration(claims, maxTokenLifetimeSec);
		}

		// Revoked token check
		if (options.revokedTokenChecker && claims.jti) {
			const isTokenRevoked = await options.revokedTokenChecker.isTokenRevoked(
				tenantId,
				documentId,
				claims.jti,
			);
			if (isTokenRevoked) {
				throw new NetworkError(403, "Permission denied. Access token has been revoked.");
			}
		}

		// Check token cache first
		if ((options.enableTokenCache || options.ensureSingleUseToken) && options.tokenCache) {
			const cachedToken = await options.tokenCache.get(token).catch((error) => {
				Lumberjack.error("Unable to retrieve cached JWT", logProperties, error);
				return false;
			});

			if (cachedToken) {
				Lumberjack.verbose("Token cache hit", logProperties);
				if (options.ensureSingleUseToken) {
					throw new NetworkError(403, "Access token has already been used.");
				}
				return;
			}
		}

		await tenantManager.verifyToken(claims.tenantId, token);

		// Update token cache
		if ((options.enableTokenCache || options.ensureSingleUseToken) && options.tokenCache) {
			Lumberjack.verbose("Token cache miss", logProperties);

			// Only cache tokens if it has more than 5 minutes left before expiration
			const expirationBufferInMs = 5 * 60 * 1000; // 5 minutes
			if (
				!options.ensureSingleUseToken &&
				tokenLifetimeMs !== undefined &&
				tokenLifetimeMs <= expirationBufferInMs
			) {
				Lumberjack.verbose(
					`Token near expiration: ${tokenLifetimeMs}, skip cache tokens`,
					logProperties,
				);
				return;
			}

			const tokenCacheKey = token;
			options.tokenCache
				.set(
					tokenCacheKey,
					"used",
					tokenLifetimeMs !== undefined ? Math.floor(tokenLifetimeMs / 1000) : undefined,
				)
				.catch((error) => {
					Lumberjack.error("Unable to cache JWT", logProperties, error);
				});
		}
	} catch (error) {
		if (isNetworkError(error)) {
			throw error;
		}
		// We don't understand the error, so it is likely an internal service error.
		Lumberjack.error(
			"Unrecognized error when validating/verifying request token",
			logProperties,
			error,
		);
		throw new NetworkError(500, "Internal server error.");
	}
}

/**
 * Verifies the storage token claims and calls riddler to validate the token.
 * @internal
 */
export function verifyStorageToken(
	tenantManager: ITenantManager,
	config: Provider,
	options: IVerifyTokenOptions = {
		requireDocumentId: true,
		ensureSingleUseToken: false,
		singleUseTokenCache: undefined,
		enableTokenCache: false,
		tokenCache: undefined,
		revokedTokenChecker: undefined,
	},
): RequestHandler {
	const maxTokenLifetimeSec = getNumberFromConfig("auth:maxTokenLifetimeSec", config);
	const isTokenExpiryEnabled = getBooleanFromConfig("auth:enableTokenExpiration", config);
	// Prevent service from starting with invalid configs
	if (isTokenExpiryEnabled && isNaN(maxTokenLifetimeSec)) {
		throw new Error(
			"Invalid configuration: no maxTokenLifetimeSec when token expiry is enabled",
		);
	}

	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	return async (request, res, next) => {
		const tenantId = getParam(request.params, "tenantId");
		if (!tenantId) {
			return respondWithNetworkError(
				res,
				new NetworkError(403, "Missing tenantId in request."),
			);
		}
		const documentId = getParam(request.params, "id") ?? request.body.id;
		if (options.requireDocumentId && !documentId) {
			return respondWithNetworkError(
				res,
				new NetworkError(403, "Missing documentId in request"),
			);
		}

		const moreOptions: IVerifyTokenOptions = options;
		moreOptions.maxTokenLifetimeSec = maxTokenLifetimeSec;
		moreOptions.requireTokenExpiryCheck = isTokenExpiryEnabled;

		try {
			await verifyToken(
				tenantId,
				documentId,
				getTokenFromRequest(request),
				tenantManager,
				moreOptions,
			);
			// Riddler is known to take too long sometimes. Check timeout before continuing.
			getGlobalTimeoutContext().checkTimeout();

			// eslint-disable-next-line @typescript-eslint/return-await
			return getGlobalTelemetryContext().bindPropertiesAsync(
				{ tenantId, documentId },
				async () => next(),
			);
		} catch (error) {
			if (isNetworkError(error)) {
				return respondWithNetworkError(res, error);
			}
			// We don't understand the error, so it is likely an internal service error.
			Lumberjack.error(
				"Unrecognized error when validating/verifying request token",
				getLumberBaseProperties(documentId, tenantId),
				error,
			);
			return respondWithNetworkError(res, new NetworkError(500, "Internal server error."));
		}
	};
}

/**
 * @internal
 */
export function validateTokenScopeClaims(expectedScopes: string): RequestHandler {
	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	return async (request, response, next) => {
		let token: string = "";
		try {
			token = getTokenFromRequest(request);
		} catch (error: unknown) {
			if (error instanceof NetworkError) {
				return respondWithNetworkError(response, error);
			}
			return respondWithNetworkError(
				response,
				new NetworkError(403, "Missing access token."),
			);
		}

		let claims: ITokenClaims;
		try {
			claims = decode(token) as ITokenClaims;
		} catch {
			return respondWithNetworkError(response, new NetworkError(401, "Invalid token."));
		}

		if (!claims) {
			return respondWithNetworkError(
				response,
				new NetworkError(403, "Missing token claims."),
			);
		}

		if (claims.scopes === undefined || claims.scopes === null || claims.scopes.length === 0) {
			return respondWithNetworkError(
				response,
				new NetworkError(403, "Missing scopes in token claims."),
			);
		}

		if (expectedScopes === TokenRevokeScopeType && !canRevokeToken(claims.scopes)) {
			return respondWithNetworkError(
				response,
				new NetworkError(403, "Missing RevokeToken scopes in token claims."),
			);
		}
		if (expectedScopes === DocDeleteScopeType && !canDeleteDoc(claims.scopes)) {
			return respondWithNetworkError(
				response,
				new NetworkError(403, "Missing DocDelete scopes in token claims."),
			);
		}
		next();
	};
}

/**
 * @internal
 */
export function getParam(params: Params, key: string) {
	return Array.isArray(params) ? undefined : params[key];
}

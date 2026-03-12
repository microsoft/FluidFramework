/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IPublicClientConfig,
	IOdspTokens,
	TokenRequestCredentials,
} from "@fluidframework/odsp-doclib-utils/internal";
import {
	fetchTokens,
	getOdspScope,
	pushScope,
	refreshTokens,
} from "@fluidframework/odsp-doclib-utils/internal";
import { Mutex } from "async-mutex";

import { debug } from "./debug.js";
import type { IAsyncCache, IResources } from "./fluidToolRc.js";
import { loadRC, lockRC, saveRC } from "./fluidToolRc.js";
import { unreachableCase } from "@fluidframework/core-utils/internal";

// TODO: Add documentation
// eslint-disable-next-line jsdoc/require-description
/**
 * @internal
 */
export const getMicrosoftConfiguration = (): IPublicClientConfig => ({
	get clientId(): string {
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		if (!process.env.login__microsoft__clientId) {
			throw new Error("Client ID environment variable not set: login__microsoft__clientId.");
		}
		return process.env.login__microsoft__clientId;
	},
});

/**
 * @internal
 */
export type LoginConfig =
	| {
			type: "password";
			username: string;
			password: string;
	  }
	| {
			type: "fic";
			username: string;
			fetchToken(scopeEndpoint: "push" | "storage"): Promise<string>;
	  };

/**
 * @internal
 */
export interface IOdspTokenManagerCacheKey {
	readonly isPush: boolean;
	readonly user: string;
}

const isValidAndNotExpiredToken = (tokens: IOdspTokens): boolean => {
	// Return false for undefined or empty tokens.
	if (!tokens.accessToken || tokens.accessToken.length === 0) {
		return false;
	}

	if (tokens.receivedAt === undefined || tokens.expiresIn === undefined) {
		// If we don't have receivedAt or expiresIn, we treat the token as expired.
		return false;
	}

	const expiresAt = tokens.receivedAt + tokens.expiresIn;
	// Give it a 60s buffer
	return expiresAt - 60 >= Date.now() / 1000;
};

const cacheKeyToString = (key: IOdspTokenManagerCacheKey): string => {
	return `${key.user}${key.isPush ? "[Push]" : ""}`;
};

/**
 * @internal
 */
export class OdspTokenManager {
	private readonly storageCache = new Map<string, IOdspTokens>();
	private readonly pushCache = new Map<string, IOdspTokens>();
	private readonly cacheMutex = new Mutex();
	public constructor(
		private readonly tokenCache?: IAsyncCache<IOdspTokenManagerCacheKey, IOdspTokens>,
	) {}

	public async updateTokensCache(
		key: IOdspTokenManagerCacheKey,
		value: IOdspTokens,
	): Promise<void> {
		await this.cacheMutex.runExclusive(async () => {
			await this.updateTokensCacheWithoutLock(key, value);
		});
	}

	private async updateTokensCacheWithoutLock(
		key: IOdspTokenManagerCacheKey,
		value: IOdspTokens,
	): Promise<void> {
		debug(`${cacheKeyToString(key)}: Saving tokens`);
		const memoryCache = key.isPush ? this.pushCache : this.storageCache;
		memoryCache.set(key.user, value);
		await this.tokenCache?.save(key, value);
	}

	public async getOdspTokens(
		server: string,
		clientConfig: IPublicClientConfig,
		tokenConfig: LoginConfig,
		forceRefresh = false,
		forceReauth = false,
	): Promise<IOdspTokens> {
		debug("Getting odsp tokens");
		return this.getTokens(false, server, clientConfig, tokenConfig, forceRefresh, forceReauth);
	}

	public async getPushTokens(
		server: string,
		clientConfig: IPublicClientConfig,
		tokenConfig: LoginConfig,
		forceRefresh = false,
		forceReauth = false,
	): Promise<IOdspTokens> {
		debug("Getting push tokens");
		return this.getTokens(true, server, clientConfig, tokenConfig, forceRefresh, forceReauth);
	}

	private async getTokenFromCache(
		cacheKey: IOdspTokenManagerCacheKey,
	): Promise<IOdspTokens | undefined> {
		const memoryCache = cacheKey.isPush ? this.pushCache : this.storageCache;
		const memoryToken = memoryCache.get(cacheKey.user);
		if (memoryToken) {
			debug(`${cacheKeyToString(cacheKey)}: Token found in memory `);
			return memoryToken;
		}
		const fileToken = await this.tokenCache?.get(cacheKey);
		if (fileToken) {
			debug(`${cacheKeyToString(cacheKey)}: Token found in file`);
			memoryCache.set(cacheKey.user, fileToken);
			return fileToken;
		}
	}

	private static getCacheKey(
		isPush: boolean,
		tokenConfig: LoginConfig,
	): IOdspTokenManagerCacheKey {
		return {
			isPush,
			user: tokenConfig.username,
		};
	}

	private async getTokens(
		isPush: boolean,
		server: string,
		clientConfig: IPublicClientConfig,
		tokenConfig: LoginConfig,
		forceRefresh: boolean,
		forceReauth: boolean,
	): Promise<IOdspTokens> {
		const invokeGetTokensCore = async (): Promise<IOdspTokens> => {
			// Don't solely rely on tokenCache lock, ensure serialized execution of
			// cache update to avoid multiple fetch.
			return this.cacheMutex.runExclusive(async () => {
				return this.getTokensCore(
					isPush,
					server,
					clientConfig,
					tokenConfig,
					forceRefresh,
					forceReauth,
				);
			});
		};
		if (!forceReauth && !forceRefresh) {
			// check and return if it exists without lock
			const cacheKey = OdspTokenManager.getCacheKey(isPush, tokenConfig);
			const tokensFromCache = await this.getTokenFromCache(cacheKey);
			if (tokensFromCache) {
				if (isValidAndNotExpiredToken(tokensFromCache)) {
					debug(`${cacheKeyToString(cacheKey)}: Token reused from cache `);
					return tokensFromCache;
				}
				debug(`${cacheKeyToString(cacheKey)}: Token expired from cache `);
			}
		}
		if (this.tokenCache) {
			// check with lock, used to prevent concurrent auth attempts
			return this.tokenCache.lock(invokeGetTokensCore);
		}
		return invokeGetTokensCore();
	}

	private async getTokensCore(
		isPush: boolean,
		server: string,
		clientConfig: IPublicClientConfig,
		loginConfig: LoginConfig,
		forceRefresh: boolean,
		forceReauth: boolean,
	): Promise<IOdspTokens> {
		const scope = isPush ? pushScope : getOdspScope(server);
		const cacheKey = OdspTokenManager.getCacheKey(isPush, loginConfig);
		let tokens: IOdspTokens | undefined;
		if (!forceReauth) {
			// check the cache again under the lock (if it is there)
			const tokensFromCache = await this.getTokenFromCache(cacheKey);
			if (tokensFromCache) {
				if (forceRefresh || !isValidAndNotExpiredToken(tokensFromCache)) {
					try {
						// For bearer tokens, use getNewToken callback instead of OAuth refresh
						if (loginConfig.type === "fic") {
							const scopeEndpoint = isPush ? "push" : "storage" as const;
							const newTokenData = await loginConfig.fetchToken(scopeEndpoint);
							tokens = this.ficTokenToIOdspTokens(newTokenData, isPush);
							await this.updateTokensCacheWithoutLock(cacheKey, tokens);
						} else if (tokensFromCache.refreshToken !== undefined) {
							// For OAuth flows, use refresh token
							tokens = await refreshTokens(server, scope, clientConfig, tokensFromCache);
							await this.updateTokensCacheWithoutLock(cacheKey, tokens);
						}
					} catch (error) {
						debug(`${cacheKeyToString(cacheKey)}: Error in refreshing token. ${error}`);
					}
				} else {
					tokens = tokensFromCache;
					debug(`${cacheKeyToString(cacheKey)}: Token reused from locked cache `);
				}
			}
			if (tokens) {
				return tokens;
			}
		}

		switch (loginConfig.type) {
			case "password": {
				tokens = await this.acquireTokensWithPassword(
					server,
					scope,
					clientConfig,
					loginConfig.username,
					loginConfig.password,
				);
				break;
			}
			case "fic": {
				const tokenData = await loginConfig.fetchToken(isPush ? "push" : "storage");
				tokens = this.ficTokenToIOdspTokens(tokenData, isPush);
				break;
			}
			default: {
				unreachableCase(loginConfig);
			}
		}

		if (!isValidAndNotExpiredToken(tokens)) {
			throw new Error(
				`Acquired invalid tokens for ${cacheKeyToString(cacheKey)}. ` +
					`Acquired token JSON: ${JSON.stringify(tokens)}`,
			);
		}

		await this.updateTokensCacheWithoutLock(cacheKey, tokens);
		return tokens;
	}

	private async acquireTokensWithPassword(
		server: string,
		scope: string,
		clientConfig: IPublicClientConfig,
		username: string,
		password: string,
	): Promise<IOdspTokens> {
		const credentials: TokenRequestCredentials = {
			grant_type: "password",
			username,
			password,
		};
		return fetchTokens(server, scope, clientConfig, credentials);
	}

	private ficTokenToIOdspTokens(token: string, isPush: boolean): IOdspTokens {
		if (isPush) {
			// Push tokens are not standard JWTs. With direct token exchange, the second leg includes information about expiry.
			// This is not available in the FIC flow, but we request tokens with 1 hour expiry so default to that.
			// At worst this should result in some higher latency when a token is returned from the cache when it should really be
			// refreshed immediately (but attempting to use this token later will trigger a normal refresh flow).
			return {
				accessToken: token,
				receivedAt: Math.floor(Date.now() / 1000),
				expiresIn: 3600,
			};
		} else {
			return this.jwtToIOdspTokens(token);
		}
	}

	private jwtToIOdspTokens(token: string): IOdspTokens {
		let receivedAt: number;
		let expiresIn: number;
		const payloadSegment = token.split(".")[1];
		if (payloadSegment === undefined) {
			throw new Error("Invalid JWT format");
		}
		const payload = JSON.parse(
			Buffer.from(payloadSegment, "base64url").toString("utf8"),
		) as { iat?: number; exp?: number };
		if (typeof payload.iat === "number") {
			receivedAt = payload.iat;
		} else {
			throw new Error("JWT payload lacks valid iat claim.")
		}
		if (typeof payload.exp === "number" && typeof payload.iat === "number") {
			expiresIn = payload.exp - payload.iat;
		} else {
			throw new Error("JWT payload lacks valid exp claim.")
		}

		return {
			accessToken: token,
			receivedAt,
			expiresIn,
		};
	}
}

async function loadAndPatchRC(): Promise<IResources> {
	const rc = await loadRC();
	if (rc.tokens && rc.tokens.version === undefined) {
		// Clean up older versions
		delete rc.tokens;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		delete (rc as any).pushTokens;
	}
	return rc;
}

/**
 * @internal
 */
export const odspTokensCache: IAsyncCache<IOdspTokenManagerCacheKey, IOdspTokens> = {
	async get(key: IOdspTokenManagerCacheKey): Promise<IOdspTokens | undefined> {
		const rc = await loadAndPatchRC();
		return rc.tokens?.data[key.user]?.[key.isPush ? "push" : "storage"];
	},
	async save(key: IOdspTokenManagerCacheKey, tokens: IOdspTokens): Promise<void> {
		const rc = await loadAndPatchRC();
		// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- using ??= could change behavior if value is falsy
		if (!rc.tokens) {
			rc.tokens = {
				version: 1,
				data: {},
			};
		}
		let prevTokens = rc.tokens.data[key.user];
		if (!prevTokens) {
			prevTokens = {};
			rc.tokens.data[key.user] = prevTokens;
		}
		prevTokens[key.isPush ? "push" : "storage"] = tokens;
		return saveRC(rc);
	},
	async lock<T>(callback: () => Promise<T>): Promise<T> {
		const release = await lockRC();
		try {
			return await callback();
		} finally {
			await release();
		}
	},
};

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils";
import {
	IOdspTokens,
	IClientConfig,
	fetchTokens,
	refreshTokens,
	getOdspScope,
	pushScope,
	getLoginPageUrl,
	TokenRequestCredentials,
} from "@fluidframework/odsp-doclib-utils/internal";
import { jwtDecode } from "jwt-decode";
import { Mutex } from "async-mutex";
import { debug } from "./debug.js";
import { IAsyncCache, loadRC, saveRC, lockRC } from "./fluidToolRC.js";
import { serverListenAndHandle, endResponse } from "./httpHelpers.js";

const odspAuthRedirectPort = 7000;
const odspAuthRedirectOrigin = `http://localhost:${odspAuthRedirectPort}`;
const odspAuthRedirectUri = new URL("/auth/callback", odspAuthRedirectOrigin).href;

/**
 * @internal
 */
export const getMicrosoftConfiguration = (): IClientConfig => ({
	get clientId() {
		if (!process.env.login__microsoft__clientId) {
			throw new Error("Client ID environment variable not set: login__microsoft__clientId.");
		}
		return process.env.login__microsoft__clientId;
	},
	get clientSecret() {
		if (!process.env.login__microsoft__secret) {
			throw new Error(
				"Client Secret environment variable not set: login__microsoft__secret.",
			);
		}
		return process.env.login__microsoft__secret;
	},
});

/**
 * @internal
 */
export type OdspTokenConfig =
	| {
			type: "password";
			username: string;
			password: string;
	  }
	| {
			type: "browserLogin";
			navigator: (url: string) => void;
			redirectUriCallback?: (tokens: IOdspTokens) => Promise<string>;
	  };

/**
 * @internal
 */
export interface IOdspTokenManagerCacheKey {
	readonly isPush: boolean;
	readonly userOrServer: string;
}

const isValidToken = (token: string) => {
	// Return false for undefined or empty tokens.
	if (!token || token.length === 0) {
		return false;
	}

	const decodedToken = jwtDecode<any>(token);
	// Give it a 60s buffer
	return decodedToken.exp - 60 >= new Date().getTime() / 1000;
};

const cacheKeyToString = (key: IOdspTokenManagerCacheKey) => {
	return `${key.userOrServer}${key.isPush ? "[Push]" : ""}`;
};

/**
 * @internal
 */
export class OdspTokenManager {
	private readonly storageCache = new Map<string, IOdspTokens>();
	private readonly pushCache = new Map<string, IOdspTokens>();
	private readonly cacheMutex = new Mutex();
	constructor(
		private readonly tokenCache?: IAsyncCache<IOdspTokenManagerCacheKey, IOdspTokens>,
	) {}

	public async updateTokensCache(key: IOdspTokenManagerCacheKey, value: IOdspTokens) {
		await this.cacheMutex.runExclusive(async () => {
			await this.updateTokensCacheWithoutLock(key, value);
		});
	}

	private async updateTokensCacheWithoutLock(key: IOdspTokenManagerCacheKey, value: IOdspTokens) {
		debug(`${cacheKeyToString(key)}: Saving tokens`);
		const memoryCache = key.isPush ? this.pushCache : this.storageCache;
		memoryCache.set(key.userOrServer, value);
		await this.tokenCache?.save(key, value);
	}

	public async getOdspTokens(
		server: string,
		clientConfig: IClientConfig,
		tokenConfig: OdspTokenConfig,
		forceRefresh = false,
		forceReauth = false,
	): Promise<IOdspTokens> {
		return this.getTokens(false, server, clientConfig, tokenConfig, forceRefresh, forceReauth);
	}

	public async getPushTokens(
		server: string,
		clientConfig: IClientConfig,
		tokenConfig: OdspTokenConfig,
		forceRefresh = false,
		forceReauth = false,
	): Promise<IOdspTokens> {
		return this.getTokens(true, server, clientConfig, tokenConfig, forceRefresh, forceReauth);
	}

	private async getTokenFromCache(cacheKey: IOdspTokenManagerCacheKey) {
		const memoryCache = cacheKey.isPush ? this.pushCache : this.storageCache;
		const memoryToken = memoryCache.get(cacheKey.userOrServer);
		if (memoryToken) {
			debug(`${cacheKeyToString(cacheKey)}: Token found in memory `);
			return memoryToken;
		}
		const fileToken = await this.tokenCache?.get(cacheKey);
		if (fileToken) {
			debug(`${cacheKeyToString(cacheKey)}: Token found in file`);
			memoryCache.set(cacheKey.userOrServer, fileToken);
			return fileToken;
		}
	}

	private static getCacheKey(
		isPush: boolean,
		tokenConfig: OdspTokenConfig,
		server: string,
	): IOdspTokenManagerCacheKey {
		// If we are using password, we should cache the token per user instead of per server
		return {
			isPush,
			userOrServer: tokenConfig.type === "password" ? tokenConfig.username : server,
		};
	}

	private async getTokens(
		isPush: boolean,
		server: string,
		clientConfig: IClientConfig,
		tokenConfig: OdspTokenConfig,
		forceRefresh: boolean,
		forceReauth: boolean,
	): Promise<IOdspTokens> {
		const invokeGetTokensCore = async () => {
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
			const cacheKey = OdspTokenManager.getCacheKey(isPush, tokenConfig, server);
			const tokensFromCache = await this.getTokenFromCache(cacheKey);
			if (tokensFromCache) {
				if (isValidToken(tokensFromCache.accessToken)) {
					debug(`${cacheKeyToString(cacheKey)}: Token reused from cache `);
					await this.onTokenRetrievalFromCache(tokenConfig, tokensFromCache);
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
		clientConfig: IClientConfig,
		tokenConfig: OdspTokenConfig,
		forceRefresh,
		forceReauth,
	): Promise<IOdspTokens> {
		const scope = isPush ? pushScope : getOdspScope(server);
		const cacheKey = OdspTokenManager.getCacheKey(isPush, tokenConfig, server);
		let tokens: IOdspTokens | undefined;
		if (!forceReauth) {
			// check the cache again under the lock (if it is there)
			const tokensFromCache = await this.getTokenFromCache(cacheKey);
			if (tokensFromCache) {
				if (forceRefresh || !isValidToken(tokensFromCache.accessToken)) {
					try {
						// This updates the tokens in tokensFromCache
						tokens = await refreshTokens(server, scope, clientConfig, tokensFromCache);
						await this.updateTokensCacheWithoutLock(cacheKey, tokens);
					} catch (error) {
						debug(`${cacheKeyToString(cacheKey)}: Error in refreshing token. ${error}`);
					}
				} else {
					tokens = tokensFromCache;
					debug(`${cacheKeyToString(cacheKey)}: Token reused from locked cache `);
				}
			}
		}

		if (tokens) {
			await this.onTokenRetrievalFromCache(tokenConfig, tokens);
			return tokens;
		}

		switch (tokenConfig.type) {
			case "password":
				tokens = await this.acquireTokensWithPassword(
					server,
					scope,
					clientConfig,
					tokenConfig.username,
					tokenConfig.password,
				);
				break;
			case "browserLogin":
				tokens = await this.acquireTokensViaBrowserLogin(
					getLoginPageUrl(server, clientConfig, scope, odspAuthRedirectUri),
					server,
					clientConfig,
					scope,
					tokenConfig.navigator,
					tokenConfig.redirectUriCallback,
				);
				break;
			default:
				unreachableCase(tokenConfig);
		}

		await this.updateTokensCacheWithoutLock(cacheKey, tokens);
		return tokens;
	}

	private async acquireTokensWithPassword(
		server: string,
		scope: string,
		clientConfig: IClientConfig,
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

	private async acquireTokensViaBrowserLogin(
		loginPageUrl: string,
		server: string,
		clientConfig: IClientConfig,
		scope: string,
		navigator: (url: string) => void,
		redirectUriCallback?: (tokens: IOdspTokens) => Promise<string>,
	): Promise<IOdspTokens> {
		// Start up a local auth redirect handler service to receive the tokens after login
		const tokenGetter = await serverListenAndHandle(odspAuthRedirectPort, async (req, res) => {
			// extract code from request URL and fetch the tokens
			const credentials: TokenRequestCredentials = {
				grant_type: "authorization_code",
				code: this.extractAuthorizationCode(req.url),
				redirect_uri: odspAuthRedirectUri,
			};
			const tokens = await fetchTokens(server, scope, clientConfig, credentials);

			// redirect now that the browser is done with auth
			if (redirectUriCallback) {
				res.writeHead(301, { Location: await redirectUriCallback(tokens) });
				await endResponse(res);
			} else {
				res.write("Please close the window");
				await endResponse(res);
			}

			return tokens;
		});

		// Now that our local redirect handler is up, navigate the browser to the login page
		navigator(loginPageUrl);

		// Receive and extract the tokens
		const odspTokens = await tokenGetter();

		return odspTokens;
	}

	private async onTokenRetrievalFromCache(config: OdspTokenConfig, tokens: IOdspTokens) {
		if (config.type === "browserLogin" && config.redirectUriCallback) {
			config.navigator(await config.redirectUriCallback(tokens));
		}
	}

	private extractAuthorizationCode(relativeUrl: string | undefined): string {
		if (relativeUrl === undefined) {
			throw Error("Failed to get authorization");
		}
		const parsedUrl = new URL(relativeUrl, odspAuthRedirectOrigin);
		const code = parsedUrl.searchParams.get("code");
		if (!code) {
			throw Error("Failed to get authorization");
		}
		return code;
	}
}

async function loadAndPatchRC() {
	const rc = await loadRC();
	if (rc.tokens && rc.tokens.version === undefined) {
		// Clean up older versions
		delete (rc as any).tokens;
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
		return rc.tokens?.data[key.userOrServer]?.[key.isPush ? "push" : "storage"];
	},
	async save(key: IOdspTokenManagerCacheKey, tokens: IOdspTokens): Promise<void> {
		const rc = await loadAndPatchRC();
		if (!rc.tokens) {
			rc.tokens = {
				version: 1,
				data: {},
			};
		}
		let prevTokens = rc.tokens.data[key.userOrServer];
		if (!prevTokens) {
			prevTokens = {};
			rc.tokens.data[key.userOrServer] = prevTokens;
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

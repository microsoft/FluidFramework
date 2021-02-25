/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import {
    IOdspTokens,
    IClientConfig,
    fetchTokens,
    refreshTokens,
    getOdspScope,
    pushScope,
    getLoginPageUrl,
    TokenRequestCredentials,
} from "@fluidframework/odsp-doclib-utils";
import jwtDecode from "jwt-decode";
import { debug } from "./debug";
import { IAsyncCache, loadRC, saveRC, lockRC } from "./fluidToolRC";
import { serverListenAndHandle, endResponse } from "./httpHelpers";

const odspAuthRedirectPort = 7000;
const odspAuthRedirectOrigin = `http://localhost:${odspAuthRedirectPort}`;
const odspAuthRedirectUri = new URL("/auth/callback", odspAuthRedirectOrigin).href;

export const getMicrosoftConfiguration = (): IClientConfig => ({
    get clientId() {
        if (!process.env.login__microsoft__clientId) {
            throw new Error("Client ID environment variable not set: login__microsoft__clientId.");
        }
        return process.env.login__microsoft__clientId;
    },
    get clientSecret() {
        if (!process.env.login__microsoft__secret) {
            throw new Error("Client Secret environment variable not set: login__microsoft__secret.");
        }
        return process.env.login__microsoft__secret;
    },
});

export type OdspTokenConfig = {
    type: "password";
    username: string;
    password: string;
} | {
    type: "browserLogin";
    navigator: (url: string) => void;
    redirectUriCallback?: (tokens: IOdspTokens) => Promise<string>;
};

export interface IOdspTokenManagerCacheKey { isPush: boolean; server: string; }

const isValidToken = (token: string) => {
    const decodedToken = jwtDecode<any>(token);
    // Give it a 60s buffer
    return (decodedToken.exp - 60 >= (new Date().getTime() / 1000));
};

const cacheKeyToString = (key: IOdspTokenManagerCacheKey) => {
    return `${key.server}${key.isPush ? "[Push]" : ""}`;
};

export class OdspTokenManager {
    private readonly storageCache = new Map<string, IOdspTokens>();
    private readonly pushCache = new Map<string, IOdspTokens>();
    constructor(
        private readonly tokenCache?: IAsyncCache<IOdspTokenManagerCacheKey, IOdspTokens>,
    ) { }

    public async updateTokensCache(key: IOdspTokenManagerCacheKey, value: IOdspTokens) {
        debug(`${cacheKeyToString(key)}: Saving tokens`);
        const memoryCache = key.isPush ? this.pushCache : this.storageCache;
        memoryCache.set(key.server, value);
        await this.tokenCache?.save(key, value);
    }

    public async getOdspTokens(
        server: string,
        clientConfig: IClientConfig,
        tokenConfig: OdspTokenConfig,
        forceRefresh = false,
        forceReauth = false,
    ): Promise<IOdspTokens> {
        return this.getTokens(
            false,
            server,
            clientConfig,
            tokenConfig,
            forceRefresh,
            forceReauth,
        );
    }

    public async getPushTokens(
        server: string,
        clientConfig: IClientConfig,
        tokenConfig: OdspTokenConfig,
        forceRefresh = false,
        forceReauth = false,
    ): Promise<IOdspTokens> {
        return this.getTokens(
            true,
            server,
            clientConfig,
            tokenConfig,
            forceRefresh,
            forceReauth,
        );
    }

    private async getTokenFromCache(
        cacheKey: IOdspTokenManagerCacheKey,
    ) {
        const memoryCache = cacheKey.isPush ? this.pushCache : this.storageCache;
        const memoryToken = memoryCache.get(cacheKey.server);
        if (memoryToken) {
            debug(`${cacheKeyToString(cacheKey)}: Token found in memory `);
            return memoryToken;
        }
        const fileToken = await this.tokenCache?.get(cacheKey);
        if (fileToken) {
            debug(`${cacheKeyToString(cacheKey)}: Token found in file`);
            memoryCache.set(cacheKey.server, fileToken);
            return fileToken;
        }
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
            return this.getTokensCore(
                isPush,
                server,
                clientConfig,
                tokenConfig,
                forceRefresh,
                forceReauth);
        };
        if (!forceReauth && !forceRefresh) {
            // check and return if it exists without lock
            const cacheKey: IOdspTokenManagerCacheKey = { isPush, server };
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
        const cacheKey: IOdspTokenManagerCacheKey = { isPush, server };
        if (!forceReauth) {
            // check the cache again under the lock (if it is there)
            const tokensFromCache = await this.getTokenFromCache(cacheKey);
            if (tokensFromCache) {
                let canReturn = true;
                if (forceRefresh || !isValidToken(tokensFromCache.accessToken)) {
                    try {
                        // This updates the tokens in tokensFromCache
                        await refreshTokens(server, scope, clientConfig, tokensFromCache);
                    } catch (error) {
                        canReturn = false;
                    }
                    await this.updateTokensCache(cacheKey, tokensFromCache);
                } else {
                    debug(`${cacheKeyToString(cacheKey)}: Token reused from locked cache `);
                }
                if (canReturn) {
                    await this.onTokenRetrievalFromCache(tokenConfig, tokensFromCache);
                    return tokensFromCache;
                }
            }
        }

        let tokens: IOdspTokens | undefined;
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

        await this.updateTokensCache(cacheKey, tokens);

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

export const odspTokensCache: IAsyncCache<IOdspTokenManagerCacheKey, IOdspTokens> = {
    async get(key: IOdspTokenManagerCacheKey): Promise<IOdspTokens | undefined> {
        const rc = await loadAndPatchRC();
        return rc.tokens?.data[key.server][key.isPush ? "storage" : "push"];
    },
    async save(key: IOdspTokenManagerCacheKey, tokens: IOdspTokens): Promise<void> {
        const rc = await loadAndPatchRC();
        if (!rc.tokens) {
            rc.tokens = {
                version: 1,
                data: {},
            };
        }
        let prevTokens = rc.tokens.data[key.server];
        if (!prevTokens) {
            prevTokens = {};
            rc.tokens.data[key.server] = prevTokens;
        }
        prevTokens[key.isPush ? "storage" : "push"] = tokens;
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

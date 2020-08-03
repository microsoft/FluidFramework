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
} from "@fluidframework/odsp-utils";
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

export interface IPushCacheKey { isPush: true }
export interface IOdspCacheKey { isPush: false; server: string }
export type OdspTokenManagerCacheKey = IPushCacheKey | IOdspCacheKey;

export class OdspTokenManager {
    constructor(
        private readonly tokenCache?: IAsyncCache<OdspTokenManagerCacheKey, IOdspTokens>,
    ) { }

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
        if (this.tokenCache) {
            if (!forceReauth && !forceRefresh) {
                // check and return if it exists without lock
                const cacheKey: OdspTokenManagerCacheKey = isPush ? { isPush } : { isPush, server };
                const tokensFromCache = await this.tokenCache.get(cacheKey);
                if (tokensFromCache) {
                    await this.onTokenRetrievalFromCache(tokenConfig, tokensFromCache);
                    return tokensFromCache;
                }
            }
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
        const cacheKey: OdspTokenManagerCacheKey = isPush ? { isPush } : { isPush, server };
        if (!forceReauth && this.tokenCache) {
            const tokensFromCache = await this.tokenCache.get(cacheKey);
            if (tokensFromCache) {
                let canReturn = true;
                if (forceRefresh) {
                    try {
                        // This updates the tokens in tokensFromCache
                        await refreshTokens(server, scope, clientConfig, tokensFromCache);
                    } catch (error) {
                        canReturn = false;
                    }
                    await this.tokenCache.save(cacheKey, tokensFromCache);
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
                    getLoginPageUrl(isPush, server, clientConfig, scope, odspAuthRedirectUri),
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

        if (this.tokenCache) {
            await this.tokenCache.save(cacheKey, tokens);
        }

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

export const odspTokensCache: IAsyncCache<OdspTokenManagerCacheKey, IOdspTokens> = {
    async get(key: OdspTokenManagerCacheKey): Promise<IOdspTokens | undefined> {
        const rc = await loadRC();
        if (key.isPush) {
            return rc.pushTokens;
        } else {
            return rc.tokens && rc.tokens[key.server];
        }
    },
    async save(key: OdspTokenManagerCacheKey, tokens: IOdspTokens): Promise<void> {
        const rc = await loadRC();
        if (key.isPush) {
            rc.pushTokens = tokens;
        } else {
            let prevTokens = rc.tokens;
            if (!prevTokens) {
                prevTokens = {};
                rc.tokens = prevTokens;
            }
            prevTokens[key.server] = tokens;
        }
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

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IOdspTokens,
    IClientConfig,
    fetchTokens,
    getOdspScope,
    pushScope,
    refreshAccessToken,
    getAuthorizePageUrl,
    AuthParams,
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

export interface IOdspCacheKey { isPush: boolean; server: string }
export type OdspTokenManagerCacheKey = IOdspCacheKey;

export class OdspTokenManager {
    constructor(
        private readonly tokenCache?: IAsyncCache<OdspTokenManagerCacheKey, IOdspTokens>,
    ) { }

    public async getOdspTokens(
        server: string,
        clientConfig: IClientConfig,
        initialNavigator: (url: string) => void,
        redirectUriCallback?: (tokens: IOdspTokens) => Promise<string>,
        forceRefresh = false,
        forceReauth = false,
    ): Promise<IOdspTokens> {
        return this.getTokens(
            false,
            server,
            clientConfig,
            initialNavigator,
            forceRefresh,
            forceReauth,
            redirectUriCallback,
        );
    }

    public async getPushTokens(
        server: string,
        clientConfig: IClientConfig,
        initialNavigator: (url: string) => void,
        redirectUriCallback?: (tokens: IOdspTokens) => Promise<string>,
        forceRefresh = false,
        forceReauth = false,
    ): Promise<IOdspTokens> {
        return this.getTokens(
            true,
            server,
            clientConfig,
            initialNavigator,
            forceRefresh,
            forceReauth,
            redirectUriCallback,
        );
    }
    private async getTokens(
        isPush: boolean,
        server: string,
        clientConfig: IClientConfig,
        initialNavigator: (url: string) => void,
        forceRefresh: boolean,
        forceReauth: boolean,
        redirectUriCallback?: (tokens: IOdspTokens) => Promise<string>,
    ): Promise<IOdspTokens> {
        const getTokensCore = async () => {
            return this.getTokensCore(
                isPush,
                server,
                clientConfig,
                initialNavigator,
                forceRefresh,
                forceReauth,
                redirectUriCallback);
        };
        if (this.tokenCache) {
            if (!forceReauth && !forceRefresh) {
                // check and return if it exists without lock
                const cacheKey: OdspTokenManagerCacheKey = { isPush, server };
                const tokensFromCache = await this.tokenCache.get(cacheKey);
                //* Why are we refreshing every time?
                if (tokensFromCache?.refreshToken) {
                    if (redirectUriCallback) {
                        initialNavigator(await redirectUriCallback(tokensFromCache));
                    }
                    return tokensFromCache;
                }
            }
            // check with lock
            return this.tokenCache.lock(getTokensCore);
        }
        return getTokensCore();
    }

    private async getTokensCore(
        isPush: boolean,
        server: string,
        clientConfig: IClientConfig,
        initialNavigator: (url: string) => void,
        forceRefresh,
        forceReauth,
        redirectUriCallback?: (tokens: IOdspTokens) => Promise<string>,
    ): Promise<IOdspTokens> {
        const scope = isPush ? pushScope : getOdspScope(server);
        const cacheKey: OdspTokenManagerCacheKey = { isPush, server };
        if (!forceReauth && this.tokenCache) {
            let tokensFromCache = await this.tokenCache.get(cacheKey);
            if (tokensFromCache?.refreshToken) {
                let canReturn = true;
                if (forceRefresh) {
                    try {
                        const authParams: AuthParams = {
                            scope,
                            client_id: clientConfig.clientId,
                            client_secret: clientConfig.clientSecret,
                            grant_type: "refresh_token",
                            refresh_token: tokensFromCache.refreshToken,
                        };
                        tokensFromCache = await refreshAccessToken(server, authParams);
                    } catch (error) {
                        canReturn = false;
                    }
                    await this.tokenCache.save(cacheKey, tokensFromCache);
                }
                if (canReturn === true) {
                    if (redirectUriCallback) {
                        initialNavigator(await redirectUriCallback(tokensFromCache));
                    }
                    return tokensFromCache;
                }
            }
        }

        let tokens: IOdspTokens | undefined;
        //* Do an actual condition here... and refactor anyway, pull from config, etc.
        if (tokens === undefined) {
            tokens = await this.acquireTokensWithPassword(
                server,
                scope,
                clientConfig,
                "user0@a830edad9050849829E20060408.onmicrosoft.com",
                "Duga4880",
            );
        }
        else {
            tokens = await this.acquireTokens(
                getAuthorizePageUrl(isPush, server, clientConfig, scope, odspAuthRedirectUri),
                server,
                clientConfig,
                scope,
                initialNavigator,
                redirectUriCallback,
            );
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
        const authParams: AuthParams = {
            scope,
            client_id: clientConfig.clientId,
            client_secret: clientConfig.clientSecret,
            grant_type: "password",
            username,
            password,
        };
        return fetchTokens(server, authParams);
    }

    private async acquireTokens(
        authUrl: string,
        server: string,
        clientConfig: IClientConfig,
        scope: string,
        initialNavigator: (url: string) => void,
        redirectUriCallback?: (tokens: IOdspTokens) => Promise<string>,
    ): Promise<IOdspTokens> {
        const tokenGetter = await serverListenAndHandle(odspAuthRedirectPort, async (req, res) => {
            // get auth code
            const code = this.extractAuthorizationCode(req.url);

            // get tokens
            //* Better not to crack over clientConfig yet?
            //* Yeah I think this schema of object belongs only in odspRequest.
            const authParams: AuthParams = {
                scope,
                client_id: clientConfig.clientId,
                client_secret: clientConfig.clientSecret,
                grant_type: "authorization_code",
                code,
                redirect_uri: odspAuthRedirectUri,
            };

            const tokens = await fetchTokens(server, authParams);

            // redirect
            if (redirectUriCallback) {
                res.writeHead(301, { Location: await redirectUriCallback(tokens) });
                await endResponse(res);
            } else {
                res.write("Please close the window");
                await endResponse(res);
            }

            return tokens;
        });

        initialNavigator(authUrl);

        const odspTokens = await tokenGetter();
        return odspTokens;
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
        const tokensEntry = key.isPush ? rc.pushTokens : rc.tokens;
        return tokensEntry && tokensEntry[key.server];
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

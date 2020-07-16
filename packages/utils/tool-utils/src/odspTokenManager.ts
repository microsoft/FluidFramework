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
    getAuthorizePageUrl,
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

export interface IOdspCacheKey { isPush: boolean; server: string }
export type OdspTokenManagerCacheKey = IOdspCacheKey;

//* Put it somewhere
function unreachableCase(value: never): never {
    throw new Error(`Unreachable Case: Type of ${value} is never`);
}

export class OdspTokenManager {
    constructor(
        private readonly tokenCache?: IAsyncCache<OdspTokenManagerCacheKey, IOdspTokens>,
    ) { }

    public async getOdspTokens(
        server: string,
        clientConfig: IClientConfig,
        tokenConfig: OdspTokenConfig,
        onAfterTokenRetrieval?: (tokens: IOdspTokens) => Promise<void>,
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
            onAfterTokenRetrieval,
        );
    }

    public async getPushTokens(
        server: string,
        clientConfig: IClientConfig,
        tokenConfig: OdspTokenConfig,
        onAfterTokenRetrieval?: (tokens: IOdspTokens) => Promise<void>,
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
            onAfterTokenRetrieval,
        );
    }
    private async getTokens(
        isPush: boolean,
        server: string,
        clientConfig: IClientConfig,
        tokenConfig: OdspTokenConfig,
        forceRefresh: boolean,
        forceReauth: boolean,
        onAfterTokenRetrieval?: (tokens: IOdspTokens) => Promise<void>,
    ): Promise<IOdspTokens> {
        const invokeGetTokensCore = async () => {
            return this.getTokensCore(
                isPush,
                server,
                clientConfig,
                tokenConfig,
                forceRefresh,
                forceReauth,
                onAfterTokenRetrieval);
        };
        if (this.tokenCache) {
            if (!forceReauth && !forceRefresh) {
                // check and return if it exists without lock
                const cacheKey: OdspTokenManagerCacheKey = { isPush, server };
                const tokensFromCache = await this.tokenCache.get(cacheKey);
                if (tokensFromCache?.refreshToken) { //* or just if (tokensFromCache) ?
                    if (onAfterTokenRetrieval) {
                        await onAfterTokenRetrieval(tokensFromCache);
                    }
                    return tokensFromCache;
                }
            }
            // check with lock
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
        onAfterTokenRetrieval?: (tokens: IOdspTokens) => Promise<void>,
    ): Promise<IOdspTokens> {
        const scope = isPush ? pushScope : getOdspScope(server);
        const cacheKey: OdspTokenManagerCacheKey = { isPush, server };
        if (!forceReauth && this.tokenCache) {
            let tokensFromCache = await this.tokenCache.get(cacheKey);
            if (tokensFromCache?.refreshToken) {
                let canReturn = true;
                if (forceRefresh) {
                    try {
                        const credentials: TokenRequestCredentials = {
                            grant_type: "refresh_token",
                            refresh_token: tokensFromCache.refreshToken,
                        };
                        tokensFromCache = await fetchTokens(server, scope, clientConfig, credentials);
                    } catch (error) {
                        canReturn = false;
                    }
                    await this.tokenCache.save(cacheKey, tokensFromCache);
                }
                if (canReturn === true) {
                    if (onAfterTokenRetrieval) {
                        await onAfterTokenRetrieval(tokensFromCache);
                    }
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
                    onAfterTokenRetrieval,
                );
                break;
            case "browserLogin":
                tokens = await this.acquireTokensViaBrowserLogin(
                    getAuthorizePageUrl(isPush, server, clientConfig, scope, odspAuthRedirectUri),
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
        onAfterTokenRetrieval?: (tokens: IOdspTokens) => Promise<void>,
    ): Promise<IOdspTokens> {
        const credentials: TokenRequestCredentials = {
            grant_type: "password",
            username,
            password,
        };
        const tokens = await fetchTokens(server, scope, clientConfig, credentials);
        if (onAfterTokenRetrieval) {
            await onAfterTokenRetrieval(tokens);
        }
        return tokens;
    }

    private async acquireTokensViaBrowserLogin(
        authUrl: string,
        server: string,
        clientConfig: IClientConfig,
        scope: string,
        navigator: (url: string) => void,
        redirectUriCallback?: (tokens: IOdspTokens) => Promise<string>,
    ): Promise<IOdspTokens> {
        const tokenGetter = await serverListenAndHandle(odspAuthRedirectPort, async (req, res) => {
            // extract code from request URL and fetch the tokens
            const credentials: TokenRequestCredentials = {
                grant_type: "authorization_code",
                code: this.extractAuthorizationCode(req.url),
                redirect_uri: odspAuthRedirectUri,
            };
            const tokens = await fetchTokens(server, scope, clientConfig, credentials);

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

        navigator(authUrl);

        const odspTokens = await tokenGetter();

        //* Is this ok?
        // NOTE: We don't use onAfterTokenRetrieval here because we did the redirect above instead
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

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
    getSharepointTenant,
} from "@fluidframework/odsp-utils";
import { IAsyncCache, loadRC, saveRC } from "./fluidToolRC";
import { serverListenAndHandle, endResponse } from "./httpHelpers";

const odspAuthRedirectPort = 7000;
const odspAuthRedirectOrigin = `http://localhost:${odspAuthRedirectPort}`;
const odspAuthRedirectPath = "/auth/callback";
const odspAuthRedirectUri = `${odspAuthRedirectOrigin}${odspAuthRedirectPath}`;

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

export interface IPushCacheKey { isPush: true }
export interface IOdspCacheKey { isPush: false; server: string }
export type OdspTokenManagerCacheKey = IPushCacheKey | IOdspCacheKey;

export class OdspTokenManager {
    constructor(
        private readonly tokenCache?: IAsyncCache<OdspTokenManagerCacheKey, IOdspTokens>,
    ) {}

    public async getOdspTokens(
        server: string,
        clientConfig: IClientConfig,
        initialNavigator: (url: string) => void,
        redirectUriCallback?: (tokens: IOdspTokens) => Promise<string>,
        forceRefresh = false,
        forceReauth = false,
    ): Promise<IOdspTokens> {
        return this.getTokensCore(
            false,
            server,
            clientConfig,
            initialNavigator,
            redirectUriCallback,
            forceRefresh,
            forceReauth,
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
        return this.getTokensCore(
            true,
            server,
            clientConfig,
            initialNavigator,
            redirectUriCallback,
            forceRefresh,
            forceReauth,
        );
    }

    private async getTokensCore(
        isPush: boolean,
        server: string,
        clientConfig: IClientConfig,
        initialNavigator: (url: string) => void,
        redirectUriCallback?: (tokens: IOdspTokens) => Promise<string>,
        forceRefresh = false,
        forceReauth = false,
    ): Promise<IOdspTokens> {
        const scope = isPush ? pushScope : getOdspScope(server);
        const cacheKey: OdspTokenManagerCacheKey = isPush ? { isPush } : { isPush, server };
        if (!forceReauth && this.tokenCache) {
            const tokensFromCache = await this.tokenCache.get(cacheKey);
            if (tokensFromCache?.refreshToken) {
                let canReturn = true;
                if (forceRefresh) {
                    try {
                        await refreshAccessToken(scope, server, clientConfig, tokensFromCache);
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

        const tenant = isPush ? "organizations" : getSharepointTenant(server);
        const authUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?`
            + `client_id=${clientConfig.clientId}`
            + `&scope=${scope}`
            + `&response_type=code`
            + `&redirect_uri=${odspAuthRedirectUri}`;

        const tokens = await this.acquireTokens(
            authUrl,
            server,
            clientConfig,
            scope,
            initialNavigator,
            redirectUriCallback,
        );

        if (this.tokenCache) {
            await this.tokenCache.save(cacheKey, tokens);
        }

        return tokens;
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
            const code = this.getAuthorizationCode(req.url);

            // get tokens
            const tokens = await fetchTokens(server, clientConfig, scope, code, odspAuthRedirectUri);

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

    private getAuthorizationCode(url: string | undefined): string {
        if (url === undefined) {
            throw Error("Failed to get authorization");
        }
        const parsedUrl = new URL(`${odspAuthRedirectOrigin}/${url}`);
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
};

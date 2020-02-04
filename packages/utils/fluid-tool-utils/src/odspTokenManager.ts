/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as http from "http";
import { Socket } from "net";
import { IOdspTokens, IClientConfig, fetchTokens, getOdspScope, pushScope } from "@microsoft/fluid-odsp-utils";
import { IAsyncCache } from "./fluidToolRC";

const odspAuthRedirectPort = 7000;
const odspAuthRedirectOrigin = `http://localhost:${odspAuthRedirectPort}`;
const odspAuthRedirectPath = "/auth/callback";
const odspAuthRedirectUri = `${odspAuthRedirectOrigin}${odspAuthRedirectPath}`;

// Helpers for http
interface ITrackedHttpServer {
    readonly server: http.Server;
    readonly sockets: Set<Socket>;
    fullyClose(): void;
}
function createTrackedServer(port: number, requestListener: http.RequestListener): ITrackedHttpServer {
    const server = http.createServer(requestListener).listen(port);
    const sockets = new Set<Socket>();

    server.on("connection", (socket) => {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
    });

    return { server, sockets, fullyClose() {
        server.close();
        sockets.forEach((socket) => socket.destroy());
    }};
}
type OnceListenerHandler<T> = (req: http.IncomingMessage, res: http.ServerResponse) => Promise<T>;
type OnceListenerResult<T> = Promise<() => Promise<T>>;
const serverListenAndHandle = async <T>(handler: OnceListenerHandler<T>): OnceListenerResult<T> =>
    new Promise((outerResolve, outerReject) => {
        const innerP = new Promise<T>((innerResolve, innerReject) => {
            const httpServer = createTrackedServer(odspAuthRedirectPort, (req, res) => {
                // ignore favicon
                if (req.url === "/favicon.ico") {
                    res.writeHead(200, { "Content-Type": "image/x-icon" });
                    res.end();
                    return;
                }
                handler(req, res).finally(() => httpServer.fullyClose()).then(
                    (result) => innerResolve(result),
                    (error) => innerReject(error),
                );
            });
            outerResolve(async () => innerP);
        });
    });

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

export class OdspTokenManager {
    constructor(private readonly tokenCache?: IAsyncCache<string, IOdspTokens>) {}

    public async getOdspTokens(
        server: string,
        clientConfig: IClientConfig,
        forceReauth = false,
        initialNavigator: (url: string) => void,
        redirectUriCallback?: (tokens: IOdspTokens) => Promise<string>,
    ): Promise<IOdspTokens> {
        return this.getTokensCore(
            getOdspScope(server),
            server,
            clientConfig,
            forceReauth,
            initialNavigator,
            redirectUriCallback,
        );
    }

    public async getPushTokens(
        server: string,
        clientConfig: IClientConfig,
        forceReauth = false,
        initialNavigator: (url: string) => void,
        redirectUriCallback?: (tokens: IOdspTokens) => Promise<string>,
    ): Promise<IOdspTokens> {
        return this.getTokensCore(
            pushScope,
            server,
            clientConfig,
            forceReauth,
            initialNavigator,
            redirectUriCallback,
        );
    }

    private async getTokensCore(
        scope: string,
        server: string,
        clientConfig: IClientConfig,
        forceReauth = false,
        initialNavigator: (url: string) => void,
        redirectUriCallback?: (tokens: IOdspTokens) => Promise<string>,
    ): Promise<IOdspTokens> {
        if (!forceReauth && this.tokenCache) {
            const tokensFromCache = await this.tokenCache.get(server);
            if (tokensFromCache?.refreshToken) {
                return tokensFromCache;
            }
        }

        const authUrl = `https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?`
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
            await this.tokenCache.save(server, tokens);
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
        const tokenGetter = await serverListenAndHandle(async (req, res) => {
            // get auth code
            const code = this.getAuthorizationCode(req.url);

            // get tokens
            const tokens = await fetchTokens(server, clientConfig, scope, code, odspAuthRedirectUri);

            // redirect
            if (redirectUriCallback) {
                res.writeHead(301, { Location: await redirectUriCallback(tokens) });
                res.end();
            } else {
                res.write("Please close the window");
                res.end();
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

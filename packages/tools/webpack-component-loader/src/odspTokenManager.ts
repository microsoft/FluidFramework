// /*!
//  * Copyright (c) Microsoft Corporation. All rights reserved.
//  * Licensed under the MIT License.
//  */

// import * as http from "http";
// import * as express from "express";
// import { IOdspTokens, IClientConfig, getSharepointTenant } from "@microsoft/fluid-odsp-utils";
// import { loadRC, saveRC } from "./fluidToolRC";

// const odspAuthRedirectPort = 7000;
// const odspAuthRedirectOrigin = `http://localhost:${odspAuthRedirectPort}`;
// const odspAuthRedirectPath = "/auth/callback";
// const odspAuthRedirectUri = `${odspAuthRedirectOrigin}${odspAuthRedirectPath}`;

// // Helper for express
// export const createRedirector = (response: express.Response): (url: string) => void =>
//     (url: string) => response.redirect(url);

// // Helper for http
// type OnceListenerHandler<T> = (req: http.IncomingMessage, res: http.ServerResponse) => Promise<T>;
// type OnceListenerResult<T> = Promise<() => Promise<T>>;
// const serverListenAndHandle = async <T>(handler: OnceListenerHandler<T>): OnceListenerResult<T> =>
//     new Promise((outerResolve, outerReject) => {
//         const innerP = new Promise<T>((innerResolve, innerReject) => {
//             const httpServer = http.createServer((req, res) => {
//                 innerResolve(handler(req, res).finally(() => {
//                     httpServer.close();
//                 }));
//             }).listen(odspAuthRedirectPort);
//             outerResolve(async () => innerP);
//         });
//     });

// export class OdspTokenManager {
//     constructor(
//         private readonly redirector: (url: string) => void,
//     ) {}

//     // Unrelated to token management.
//     public getMicrosoftConfiguration(): IClientConfig {
//         const clientId = process.env.login__microsoft__clientId;
//         if (!clientId) {
//             throw Error("Client ID environment variable not set: login__microsoft__clientId.");
//         }
//         const clientSecret = process.env.login__microsoft__secret;
//         if (!clientSecret) {
//             throw Error("Client Secret environment variable not set: login__microsoft__secret.");
//         }
//         return { clientId, clientSecret };
//     }

//     public async getOdspTokens(
//         server: string,
//         clientConfig: IClientConfig,
//         forceTokenReauth: boolean,
//         redirectUriCallback?: (tokens: IOdspTokens) => Promise<string>,
//     ): Promise<IOdspTokens> {
//         if (!forceTokenReauth) {
//             const odspTokens = await this.loadCachedOdspTokens(server);
//             if (odspTokens?.refreshToken !== undefined) {
//                 return odspTokens;
//             }
//         }
//         return this.acquireOdspTokens(server, clientConfig, redirectUriCallback);
//     }

//     private async loadCachedOdspTokens(server: string): Promise<IOdspTokens | undefined> {
//         const rc = await loadRC();
//         const tokens = rc.tokens;
//         if (!tokens) {
//             return undefined;
//         }
//         const odspTokens = tokens[server];
//         if (!odspTokens) {
//             return undefined;
//         }
//         return odspTokens;
//     }

//     private async saveOdspTokensToCache(server: string, odspTokens: IOdspTokens) {
//         const rc = await loadRC();
//         let tokens = rc.tokens;
//         if (!tokens) {
//             tokens = {};
//             rc.tokens = tokens;
//         }
//         tokens[server] = odspTokens;
//         return saveRC(rc);
//     }

//     private async acquireOdspTokens(
//         server: string,
//         clientConfig: IClientConfig,
//         redirectUriCallback?: (tokens: IOdspTokens) => Promise<string>,
//     ): Promise<IOdspTokens> {
//         const authUrl = `https://login.microsoftonline.com/${getSharepointTenant(server)}/oauth2/v2.0/authorize?`
//             + `client_id=${clientConfig.clientId}`
//             + `&scope=https://${server}/AllSites.Write`
//             + `&response_type=code`
//             + `&redirect_uri=${odspAuthRedirectUri}`;

//         const tokenGetter = await serverListenAndHandle(async (req, res) => {
//             // get auth code
//             const code = this.getAuthorizationCode(req.url);

//             // get tokens
//             const postBody = `scope=offline_access https://${server}/AllSites.Write`
//                 + `&client_id=${clientConfig.clientId}`
//                 + `&client_secret=${clientConfig.clientSecret}`
//                 + `&grant_type=authorization_code`
//                 + `&code=${code}`
//                 + `&redirect_uri=${odspAuthRedirectUri}`;
//             const tokens = await postTokenRequest(server, postBody);

//             // redirect
//             if (redirectUriCallback) {
//                 res.writeHead(301, { Location: await redirectUriCallback(tokens) });
//                 res.end();
//             }

//             return tokens;
//         });

//         this.redirector(authUrl);

//         const odspTokens = await tokenGetter();
//         await this.saveOdspTokensToCache(server, odspTokens);
//         return odspTokens;
//     }

//     private getAuthorizationCode(url: string | undefined): string {
//         if (url === undefined) {
//             throw Error("Failed to get authorization");
//         }
//         const parsedUrl = new URL(`${odspAuthRedirectOrigin}/${url}`);
//         const code = parsedUrl.searchParams.get("code");
//         if (!code) {
//             throw Error("Failed to get authorization");
//         }
//         return code;
//     }
// }

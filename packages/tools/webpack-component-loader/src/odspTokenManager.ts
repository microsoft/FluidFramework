/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as http from "http";
import { IODSPTokens, IClientConfig, postTokenRequest, getSharepointTenant } from "@microsoft/fluid-odsp-utils";
import { loadRC, saveRC } from "./fluidToolRC";

const odspAuthRedirectUri = "http://localhost:7000/auth/callback";
const odspTenants = new Map<string, string>([
    ["spo", "microsoft-my.sharepoint.com"],
    ["spo-df", "microsoft-my.sharepoint-df.com"],
]);

export class OdspTokenManager {
    // Unrelated to token management.
    public getServer(tenantId: string): string {
        const server = odspTenants.get(tenantId);
        if (!server) {
            throw Error(`Invalid SPO tenantId ${tenantId}.`);
        }
        return server;
    }

    // Unrelated to token management.
    public getMicrosoftConfiguration(): IClientConfig {
        const clientId = process.env.login__microsoft__clientId;
        if (!clientId) {
            throw Error("Client ID environment variable not set: login__microsoft__clientId.");
        }
        const clientSecret = process.env.login__microsoft__secret;
        if (!clientSecret) {
            throw Error("Client Secret environment variable not set: login__microsoft__secret.");
        }
        return { clientId, clientSecret };
    }

    public async getOdspTokens(
        server: string,
        clientConfig: IClientConfig,
        forceTokenReauth: boolean,
    ): Promise<IODSPTokens> {
        if (!forceTokenReauth) {
            const odspTokens = await this.loadCachedOdspTokens(server);
            if (odspTokens?.refreshToken !== undefined) {
                return odspTokens;
            }
        }
        throw Error("Acquire ODSP tokens not yet supported.");
        return this.acquireOdspTokens(server, clientConfig, odspAuthRedirectUri);
    }

    private async loadCachedOdspTokens(server: string): Promise<IODSPTokens | undefined> {
        const rc = await loadRC();
        const tokens = rc.tokens;
        if (!tokens) {
            return undefined;
        }
        const odspTokens = tokens[server];
        if (!odspTokens) {
            return undefined;
        }
        return odspTokens;
    }

    private async saveOdspTokensToCache(server: string, odspTokens: IODSPTokens) {
        const rc = await loadRC();
        let tokens = rc.tokens;
        if (!tokens) {
            tokens = {};
            rc.tokens = tokens;
        }
        tokens[server] = odspTokens;
        return saveRC(rc);
    }

    private async acquireOdspTokens(
        server: string,
        clientConfig: IClientConfig,
        redirectUri: string,
    ): Promise<IODSPTokens> {
        const postBody = `scope=offline_access https://${server}/AllSites.Write`
            + `&client_id=${clientConfig.clientId}`
            + `&client_secret=${clientConfig.clientSecret}`
            + `&grant_type=authorization_code`
            + `&code=${await this.getAuthorizationCode(server, clientConfig, redirectUri)}`
            + `&redirect_uri=${redirectUri}`;

        const tokens = await postTokenRequest(server, postBody);
        await this.saveOdspTokensToCache(server, tokens);
        return tokens;
    }

    private async getAuthorizationCode(
        server: string,
        clientConfig: IClientConfig,
        redirectUri: string,
    ): Promise<string> {
        const authUrl = `https://login.microsoftonline.com/${getSharepointTenant(server)}/oauth2/v2.0/authorize?`
            + `client_id=${clientConfig.clientId}`
            + `&scope=https://${server}/AllSites.Write`
            + `&response_type=code`
            + `&redirect_uri=${redirectUri}`;

        const resultP = new Promise<string>((resolve, reject) => {
            const httpServer = http.createServer((req, res) => {
                res.write("Please close the window");
                res.end();
                httpServer.close();
                if (req.url === undefined) {
                    reject("Failed to get authorization");
                    return;
                }
                const url = new URL(`http://localhost:7000${req.url}`);
                const code = url.searchParams.get("code");
                if (!code) {
                    reject("Failed to get authorization");
                    return;
                }
                console.log("Got authorization code");
                resolve(code);
            }).listen(7000);
        });

        console.log(`Please open browser and navigate to this URL:\n  ${authUrl}`);
        return resultP;
    }
}

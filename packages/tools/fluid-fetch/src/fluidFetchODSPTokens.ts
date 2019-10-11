/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:object-literal-sort-keys
import {
    getSharepointTenant,
    IClientConfig,
    IODSPTokens,
    postTokenRequest,
} from "@microsoft/fluid-odsp-utils";
import * as child_process from "child_process";
import * as http from "http";
import { URL } from "url";
import { paramForceTokenReauth } from "./fluidFetchArgs";
import { loadRC, saveRC } from "./fluidToolRC";

const redirectUri = "http://localhost:7000/auth/callback";

async function getAuthorizationCode(server: string, clientConfig: IClientConfig): Promise<string> {
    let message = "Please open browser and navigate to this URL:";
    const authUrl = `https://login.microsoftonline.com/${getSharepointTenant(server)}/oauth2/v2.0/authorize?`
        + `client_id=${clientConfig.clientId}`
        + `&scope=https://${server}/AllSites.Write`
        + `&response_type=code`
        + `&redirect_uri=${redirectUri}`;
    if (process.platform === "win32") {
        child_process.exec(`start "fluid-fetch" /B "${authUrl}"`);
        message = "Opening browser to get authorization code.  If that doesn't open, please go to this URL manually";
    }

    console.log(`${message}\n  ${authUrl}`);
    return new Promise((resolve, reject) => {
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
            if (code === null) {
                reject("Failed to get authorization");
                return;
            }
            console.log("Got authorization code");
            resolve(code);
        }).listen(7000);
    });
}

async function loadODSPTokens(server: string): Promise<IODSPTokens | undefined> {
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

export async function saveAccessToken(server: string, odspTokens: IODSPTokens) {
    const rc = await loadRC();
    let tokens = rc.tokens;
    if (!tokens) {
        tokens = {};
        rc.tokens = tokens;
    }
    tokens[server] = odspTokens;
    return saveRC(rc);
}

async function getRequestAccessTokenBody(server: string, clientConfig: IClientConfig) {
    return `scope=offline_access https://${server}/AllSites.Write`
        + `&client_id=${clientConfig.clientId}`
        + `&client_secret=${clientConfig.clientSecret}`
        + `&grant_type=authorization_code`
        + `&code=${await getAuthorizationCode(server, clientConfig)}`
        + `&redirect_uri=${redirectUri}`;
}

async function acquireTokens(server: string, clientConfig: IClientConfig): Promise<IODSPTokens> {
    console.log("Acquiring tokens");
    const tokens = await postTokenRequest(server, await getRequestAccessTokenBody(server, clientConfig));
    await saveAccessToken(server, tokens);
    return tokens;
}

export async function getODSPTokens(
    server: string,
    clientConfig: IClientConfig,
    forceTokenReauth: boolean): Promise<IODSPTokens> {

    if (!forceTokenReauth && !paramForceTokenReauth) {
        const odspTokens = await loadODSPTokens(server);
        if (odspTokens !== undefined && odspTokens.refreshToken !== undefined) {
            return odspTokens;
        }
    }
    return acquireTokens(server, clientConfig);
}

export function getClientConfig() {
    const clientConfig: IClientConfig = {
        get clientId() {
            if (!process.env.login__microsoft__clientId) {
                throw new Error("ODSP clientId/secret must be set as environment variables. " +
                    "Please run the script at https://github.com/microsoft/FluidFramework/tree/master/tools/getkeys");
            }
            return process.env.login__microsoft__clientId;
        },
        get clientSecret() {
            if (!process.env.login__microsoft__secret) {
                throw new Error("ODSP clientId/secret must be set as environment variables. " +
                    "Please run the script at https://github.com/microsoft/FluidFramework/tree/master/tools/getkeys");
            }
            return process.env.login__microsoft__secret;
        },
    };
    return clientConfig;
}

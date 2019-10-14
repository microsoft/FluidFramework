/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:object-literal-sort-keys
import { BaseTelemetryNullLogger } from "@microsoft/fluid-core-utils";
import { FluidAppOdspUrlResolver } from "@microsoft/fluid-fluidapp-odsp-urlresolver";
import * as odsp from "@microsoft/fluid-odsp-driver";
import { OdspUrlResolver } from "@microsoft/fluid-odsp-urlresolver";
import {
    getTenant,
    IClientConfig,
    IODSPTokens,
    postTokenRequest,
} from "@microsoft/fluid-odsp-utils";
import { IDocumentService, IFluidResolvedUrl, IResolvedUrl, IUrlResolver } from "@microsoft/fluid-protocol-definitions";
import * as r11s from "@microsoft/fluid-routerlicious-driver";
import { RouterliciousUrlResolver } from "@microsoft/fluid-routerlicious-urlresolver";
import * as child_process from "child_process";
import * as fs from "fs";
import * as http from "http";
import { URL } from "url";
import { localDataOnly, paramForceRefreshToken, paramJWT, paramSave, paramURL, setParamSave } from "./fluidFetchArgs";
import { loadRC, saveRC } from "./fluidToolRC";

// tslint:disable:non-literal-fs-path

export let paramDocumentService: IDocumentService | undefined;
export let latestVersionsId: string = "";
export let connectionInfo: any;

const redirectUri = "http://localhost:7000/auth/callback";

async function getAuthorizationCode(server: string, clientConfig: IClientConfig): Promise<string> {
    let message = "Please open browser and navigate to this URL:";
    const authUrl = `https://login.microsoftonline.com/${getTenant(server)}/oauth2/v2.0/authorize?`
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

async function saveAccessToken(server: string, odspTokens: IODSPTokens) {
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

async function getODSPTokens(
    server: string,
    clientConfig: IClientConfig,
    forceTokenRefresh: boolean): Promise<IODSPTokens> {

    if (!forceTokenRefresh && !paramForceRefreshToken) {
        const odspTokens = await loadODSPTokens(server);
        if (odspTokens !== undefined && odspTokens.refreshToken !== undefined) {
            return odspTokens;
        }
    }
    return acquireTokens(server, clientConfig);
}

function getClientConfig() {
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

async function initializeODSPCore(
    odspResolvedUrl: odsp.IOdspResolvedUrl,
    server: string,
    clientConfig: IClientConfig,
) {

    connectionInfo = {
        server,
        drive: odspResolvedUrl.driveId,
        item: odspResolvedUrl.itemId,
    };

    if (localDataOnly) {
        return;
    }

    console.log(`Connecting to ODSP:\n  server: ${server}\n
        drive:  ${odspResolvedUrl.driveId}\n  item:   ${odspResolvedUrl.itemId}`);

    const getStorageTokenStub = async (siteUrl: string, refresh: boolean) => {
        const tokens = await getODSPTokens(server, clientConfig, refresh);
        return tokens.accessToken;
    };
    const getWebsocketTokenStub = () => Promise.resolve("");
    const odspDocumentServiceFactory = new odsp.OdspDocumentServiceFactory(
        clientConfig.clientId,
        getStorageTokenStub,
        getWebsocketTokenStub,
        new BaseTelemetryNullLogger());
    paramDocumentService = await odspDocumentServiceFactory.createDocumentService(odspResolvedUrl);
}

async function initializeR11s(server: string, pathname: string, r11sResolvedUrl: IFluidResolvedUrl) {
    const path = pathname.split("/");
    let tenantId: string;
    let documentId: string;
    if (server === "localhost" && path.length < 4) {
        tenantId = "fluid";
        documentId = path[2];
    } else {
        tenantId = path[2];
        documentId = path[3];
    }

    // latest version id is the documentId for r11s
    latestVersionsId = documentId;

    connectionInfo = {
        server,
        tenantId,
        id: documentId,
    };

    if (localDataOnly) {
        return;
    }

    console.log(`Connecting to r11s: tenantId=${tenantId} id:${documentId}`);
    const tokenProvider = new r11s.TokenProvider(paramJWT);
    paramDocumentService = r11s.createDocumentService(
        r11sResolvedUrl.endpoints.ordererUrl,
        r11sResolvedUrl.endpoints.deltaStorageUrl,
        r11sResolvedUrl.endpoints.storageUrl,
        tokenProvider,
        tenantId,
        documentId);
}

async function resolveUrl(url: string): Promise<IResolvedUrl> {

    const resolversList: IUrlResolver[] = [
        new OdspUrlResolver(),
        new FluidAppOdspUrlResolver(),
        new RouterliciousUrlResolver(undefined, paramJWT, []),
    ];
    let resolved: IResolvedUrl | undefined;
    for (const resolver of resolversList) {
        try {
            resolved = await resolver.resolve({ url });
            return resolved;
        } catch {
            continue;
        }
    }
    if (!resolved) {
        throw new Error("No resolver is able to resolve the given url!!");
    }
    return resolved;
}

export async function fluidFetchInit() {
    if (!paramURL) {
        if (paramSave) {
            const file = `${paramSave}/info.json`;
            if (fs.existsSync(file)) {
                const info = JSON.parse(fs.readFileSync(file, { encoding: "utf-8" }));
                setParamSave(info.url as string);
            } else {
                console.log(`Can't find file ${file}`);
            }
        }

        if (!paramURL) {
            return Promise.reject("Missing URL");
        }
    }

    const url = new URL(paramURL);

    const server = url.hostname.toLowerCase();
    const resolvedUrl = await resolveUrl(paramURL) as IFluidResolvedUrl;
    const protocol = new URL(resolvedUrl.url).protocol;
    if (protocol === "fluid-odsp:") {
        const odspResolvedUrl = resolvedUrl as odsp.IOdspResolvedUrl;
        return initializeODSPCore(odspResolvedUrl, new URL(odspResolvedUrl.siteUrl).host, getClientConfig());
    } else if (protocol === "fluid:") {
        return initializeR11s(server, url.pathname, resolvedUrl);
    }
    console.log(server);
    return Promise.reject(`Unknown URL ${paramURL}`);
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:object-literal-sort-keys
import {
    getDriveItemByFileId,
    getODSPFluidResolvedUrl,
    IClientConfig,
    IODSPTokens,
    postTokenRequest,
} from "@microsoft/fluid-odsp-utils";
import * as odsp from "@prague/odsp-socket-storage";
import { IDocumentService } from "@prague/protocol-definitions";
import * as r11s from "@prague/routerlicious-socket-storage";
import { BaseTelemetryNullLogger, fromBase64ToUtf8 } from "@prague/utils";

import * as child_process from "child_process";
import * as http from "http";
import { URL } from "url";
import { paramForceRefreshToken, paramJWT, paramURL } from "./pragueDumpArgs";
import { loadRC, saveRC } from "./pragueToolRC";

export let paramDocumentService: IDocumentService;
export let latestVersionsId: string = "";
export let connectionInfo: any;

const redirectUri = "http://localhost:7000/auth/callback";

async function getAuthorizationCode(server: string, clientConfig: IClientConfig): Promise<string> {
    let message = "Please open browser and navigate to this URL:";
    const authUrl = `https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?`
        + `client_id=${clientConfig.clientId}`
        + `&scope=https://${server}/AllSites.Write`
        + `&response_type=code`
        + `&redirect_uri=${redirectUri}`;
    if (process.platform === "win32") {
        child_process.exec(`start "prague-dump" /B "${authUrl}"`);
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
    const tokens = await postTokenRequest(await getRequestAccessTokenBody(server, clientConfig));
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

async function joinODSPSession(
    server: string,
    documentDrive: string,
    documentItem: string,
    clientConfig: IClientConfig,
    forceTokenRefresh: boolean = false) {

    const odspTokens = await getODSPTokens(server, clientConfig, forceTokenRefresh);
    try {
        const oldAccessToken = odspTokens.accessToken;
        const resolvedUrl = await getODSPFluidResolvedUrl(server,
            `drives/${documentDrive}/items/${documentItem}`, odspTokens, clientConfig);
        if (oldAccessToken !== odspTokens.accessToken) {
            await saveAccessToken(server, odspTokens);
        }
        return resolvedUrl;
    } catch (e) {
        const parsedBody = JSON.parse(e.requestResult.data);
        if (parsedBody.error === "invalid_grant" && parsedBody.suberror === "consent_required" && !forceTokenRefresh) {
            return joinODSPSession(server, documentDrive, documentItem, clientConfig, true);
        }
        const responseMsg = JSON.stringify(parsedBody.error, undefined, 2);
        return Promise.reject(`Fail to connect to ODSP server\nError Response:\n${responseMsg}`);
    }
}

function getClientConfig() {
    const clientConfig: IClientConfig = {
        get clientId() {
            if (!process.env.login__microsoft__clientId) {
                throw new Error("ODSP clientId/secret must be set as environment variables. " +
                    "Please run the script at https://github.com/microsoft/Prague/tree/master/tools/getkeys");
            }
            return process.env.login__microsoft__clientId;
        },
        get clientSecret() {
            if (!process.env.login__microsoft__secret) {
                throw new Error("ODSP clientId/secret must be set as environment variables. " +
                    "Please run the script at https://github.com/microsoft/Prague/tree/master/tools/getkeys");
            }
            return process.env.login__microsoft__secret;
        },
    };
    return clientConfig;
}

async function initializeODSPCore(server: string, drive: string, item: string, clientConfig: IClientConfig) {
    if (odspServers.indexOf(server) === -1) {
        return Promise.reject(new Error(`Tenant not supported: ${server}`));
    }
    connectionInfo = {
        server,
        drive,
        item,
    };

    console.log(`Connecting to ODSP:\n  server: ${server}\n  drive:  ${drive}\n  item:   ${item}`);

    const resolvedUrl = await joinODSPSession(server, drive, item, clientConfig);

    const odspTokens = await getODSPTokens(server, clientConfig, false);
    const getStorageTokenStub = (siteUrl: string) => Promise.resolve(odspTokens.accessToken);
    const getWebsocketTokenStub = () => Promise.resolve("fake token");
    const odspDocumentServiceFactory = new odsp.OdspDocumentServiceFactory(
        "prague-dumper",
        getStorageTokenStub,
        getWebsocketTokenStub,
        new BaseTelemetryNullLogger());
    paramDocumentService = await odspDocumentServiceFactory.createDocumentService(resolvedUrl);
}

async function initializeOfficeODSP(searchParams: URLSearchParams) {
    const site = searchParams.get("site");
    if (site === null) {
        return Promise.reject("Missing site in the querystring");
    }
    const drive = searchParams.get("drive");
    if (drive === null) {
        return Promise.reject("Missing drive in the querystring");
    }
    const item = searchParams.get("item");
    if (item === null) {
        return Promise.reject("Missing item in the querystring");
    }
    const url = new URL(site);
    const server = url.host;
    return initializeODSPCore(server, drive, item, getClientConfig());
}

async function resolveDriveItemByFileId(
    server: string,
    account: string,
    docId: string,
    clientConfig: IClientConfig,
    forceTokenRefresh = false) {

    const odspTokens = await getODSPTokens(server, clientConfig, forceTokenRefresh);
    try {
        const oldAccessToken = odspTokens.accessToken;
        const driveItem = await getDriveItemByFileId(server, account, docId, clientConfig, odspTokens);
        if (oldAccessToken !== odspTokens.accessToken) {
            await saveAccessToken(server, odspTokens);
        }
        return driveItem;
    } catch (e) {
        const parsedBody = JSON.parse(e.requestResult.data);
        if (parsedBody.error === "invalid_grant" && parsedBody.suberror === "consent_required" && !forceTokenRefresh) {
            return resolveDriveItemByFileId(server, account, docId, clientConfig, true);
        }
        const responseMsg = JSON.stringify(parsedBody.error, undefined, 2);
        return Promise.reject(`Fail to connect to ODSP server\nError Response:\n${responseMsg}`);
    }
}

async function initializeODSPHosted(server: string, account: string, docId: string, clientConfig: IClientConfig) {
    const driveItem = await resolveDriveItemByFileId(server, account, docId, clientConfig);
    return initializeODSPCore(server, driveItem.drive, driveItem.item, clientConfig);
}

async function initializeODSP(
    server: string,
    pathname: string,
    searchParams: URLSearchParams) {

    const clientConfig = getClientConfig();

    // Sharepoint hosted URL
    const sourceDoc = searchParams.get("sourcedoc");
    if (sourceDoc) {
        const hostedMatch = pathname.match(/\/(personal|teams)\/([^\/]*)\//i);
        if (hostedMatch !== null) {
            return initializeODSPHosted(server, `${hostedMatch[1]}/${hostedMatch[2]}`, sourceDoc, clientConfig);
        }
    }

    // Joinsession like URL
    const joinSessionMatch = pathname.match(
        /(.*)\/_api\/v2.1\/drives\/([^\/]*)\/items\/([^\/]*)(.*)/);

    if (joinSessionMatch === null) {
        return Promise.reject("Unable to parse ODSP URL path");
    }
    const drive = joinSessionMatch[2];
    const item = joinSessionMatch[3];

    return initializeODSPCore(server, drive, item, clientConfig);
}

async function initializeFluidOffice(pathname: string) {
    const siteDriveItemMatch = pathname.match(/\/p\/([^\/]*)\/([^\/]*)\/([^\/]*)/);

    if (siteDriveItemMatch === null) {
        return Promise.reject("Unable to parse fluid.office.com URL path");
    }

    const site = siteDriveItemMatch[1];

    // Path value is base64 encoded so need to decode first
    const decodedSite = fromBase64ToUtf8(site);

    // Site value includes storage type
    const storageType = decodedSite.split(":")[0];
    const expectedStorageType = "spo";  // Only support spo for now
    if (storageType !== expectedStorageType) {
        return Promise.reject(`Unexpected storage type ${storageType}, expected: ${expectedStorageType}`);
    }

    // Since we have the drive and item, only take the host ignore the rest
    const url = new URL(decodedSite.substring(storageType.length + 1));
    const server = url.host;
    const drive = siteDriveItemMatch[2];
    const item = siteDriveItemMatch[3];
    // TODO: Assume df server now
    return initializeODSPCore(server, drive, item, getClientConfig());
}

async function initializeR11s(server: string, pathname: string) {
    const path = pathname.split("/");
    const tenantId = path[2];
    const documentId = path[3];

    // latest version id is the documentId for r11s
    latestVersionsId = documentId;

    connectionInfo = {
        server,
        tenantId,
        id: documentId,
    };

    const serverSuffix = server.substring(4);
    console.log(`Connecting to r11s: tenantId=${tenantId} id:${documentId}`);
    const tokenProvider = new r11s.TokenProvider(paramJWT);
    paramDocumentService = r11s.createDocumentService(
        `https://alfred.${serverSuffix}`,
        `https://alfred.${serverSuffix}/deltas/${tenantId}/${documentId}`,
        `https://historian.${serverSuffix}/repos/${tenantId}`,
        tokenProvider,
        tenantId,
        documentId);
}

async function initializeR11sLocalhost(pathname: string) {
    const path = pathname.split("/");
    let tenantId;
    let documentId;
    if (path.length >= 4) {
        tenantId = path[2];
        documentId = path[3];
    } else {
        tenantId = "prague";
        documentId = path[2];
    }

    // latest version id is the documentId for r11s
    latestVersionsId = documentId;

    connectionInfo = {
        server: "localhost",
        tenantId,
        id: documentId,
    };

    console.log(`Connecting to r11s localhost: tenantId=${tenantId} id:${documentId}`);
    const tokenProvider = new r11s.TokenProvider(paramJWT);
    paramDocumentService = r11s.createDocumentService(
        `http://localhost:3003/`,
        `http://localhost:3003/deltas/${tenantId}/${documentId}`,
        `http://localhost:3001/repos/${tenantId}`,
        tokenProvider,
        tenantId,
        documentId);
}

const officeServers = [
    "weuprodprv.www.office.com",
    "ncuprodprv.www.office.com",
];

const fluidOfficeServers = [
    "dev.fluid.office.com",
];

const odspServers = [
    "microsoft-my.sharepoint-df.com",
    "microsoft-my.sharepoint.com",
    "microsoft.sharepoint-df.com",
    "microsoft.sharepoint.com",
];

const r11sServers = [
    "www.wu2-ppe.prague.office-int.com",
    "www.wu2.prague.office-int.com",
    "www.eu.prague.office-int.com",
];
export async function pragueDumpInit() {
    if (paramURL) {
        const url = new URL(paramURL);

        const server = url.hostname.toLowerCase();
        if (officeServers.indexOf(server) !== -1) {
            return initializeOfficeODSP(url.searchParams);
        } else if (odspServers.indexOf(server) !== -1) {
            return initializeODSP(server, url.pathname, url.searchParams);
        } else if (r11sServers.indexOf(server) !== -1) {
            return initializeR11s(server, url.pathname);
        } else if (fluidOfficeServers.indexOf(server) !== -1) {
            return initializeFluidOffice(url.pathname);
        } else if (server === "localhost" && url.port === "3000") {
            return initializeR11sLocalhost(url.pathname);
        }
        console.log(server);
        return Promise.reject(`Unknown URL ${paramURL}`);
    }
    return Promise.reject("Missing URL");
}

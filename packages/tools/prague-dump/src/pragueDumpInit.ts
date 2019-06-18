/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:object-literal-sort-keys
import { IDocumentService } from "@prague/container-definitions";
import * as odsp from "@prague/odsp-socket-storage";
import {
    getODSPPragueResolvedUrl,
    IClientConfig,
    IODSPTokens,
    postTokenRequest,
} from "@prague/odsp-utils";
import * as r11s from "@prague/routerlicious-socket-storage";

import * as http from "http";
import { URL } from "url";

import { paramJWT, paramURL } from "./pragueDumpArgs";
import { loadRC, saveRC } from "./pragueToolRC";

export let paramDocumentService: IDocumentService;

export let connectionInfo: any;

// TODO: put this somewhere else
const clientConfig: IClientConfig = {
    clientId: "3d642166-9884-4463-8248-78961b8c1300",
    clientSecret: "IefegJIsumWtD1Of/9AIUWvm6ryR624vgMtKRmcNEsQ=",
};

const redirectUri = "http://localhost:7000/auth/callback";

async function getAuthorizationCode(server: string): Promise<string> {
    console.log("Please open browser and navigate to this URL:");
    console.log(`  https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?`
        + `client_id=${clientConfig.clientId}`
        + `&scope=https://${server}/AllSites.Write`
        + `&response_type=code`
        + `&redirect_uri=${redirectUri}`);
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

async function getRequestAccessTokenBody(server: string) {
    return `scope=offline_access https://${server}/AllSites.Write`
        + `&client_id=${clientConfig.clientId}`
        + `&client_secret=${clientConfig.clientSecret}`
        + `&grant_type=authorization_code`
        + `&code=${await getAuthorizationCode(server)}`
        + `&redirect_uri=${redirectUri}`;
}

async function acquireTokens(server: string): Promise<IODSPTokens> {
    console.log("Acquiring tokens");
    const tokens = await postTokenRequest(await getRequestAccessTokenBody(server));
    await saveAccessToken(server, tokens);
    return tokens;
}

async function getODSPTokens(server: string): Promise<IODSPTokens> {
    const odspTokens = await loadODSPTokens(server);
    if (odspTokens === undefined || odspTokens.refreshToken === undefined) {
        return acquireTokens(server);
    }
    return odspTokens;
}

async function joinODSPSession(
    server: string,
    documentDrive: string,
    documentItem: string) {

    const odspTokens = await getODSPTokens(server);
    try {
        const oldAccessToken = odspTokens.accessToken;
        const resolvedUrl = await getODSPPragueResolvedUrl(server,
            `drives/${documentDrive}/items/${documentItem}`, odspTokens, clientConfig);
        if (oldAccessToken !== odspTokens.accessToken) {
            await saveAccessToken(server, odspTokens);
        }
        return resolvedUrl;
    } catch (e) {
        const parsedBody = JSON.parse(e.data);
        const responseMsg = JSON.stringify(parsedBody.error, undefined, 2);
        return Promise.reject(`Fail to connect to ODSP server\nError Response:\n${responseMsg}`);
    }
}

async function initializeODSPCore(server: string, drive: string, item: string) {
    connectionInfo = {
        server,
        drive,
        item,
    };

    console.log(`Connecting to ODSP:\n  drive=${drive}\n  item=${item}`);

    const resolvedUrl = await joinODSPSession(server, drive, item);

    const tokenProvider = new odsp.TokenProvider(resolvedUrl.tokens.storageToken, resolvedUrl.tokens.socketToken);

    const url = new URL(resolvedUrl.url);
    const split = url.pathname.split("/");
    const tenantId = split[1];
    const documentId = split[2];
    paramDocumentService =
        new odsp.DocumentService(
            resolvedUrl.endpoints.storageUrl,
            resolvedUrl.endpoints.deltaStorageUrl,
            resolvedUrl.endpoints.ordererUrl,
            tokenProvider,
            tenantId,
            documentId);
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
    return initializeODSPCore(server, drive, item);
}

async function initializeODSP(
    server: string,
    pathname: string) {

    const odspMatch = pathname.match(
        /(.*)\/_api\/v2.1\/drives\/([^\/]*)\/items\/([^\/]*)(.*)/);

    if (odspMatch === null) {
        return Promise.reject("Unable to parse ODSP URL path");
    }
    const drive = odspMatch[2];
    const item = odspMatch[3];

    return initializeODSPCore(server, drive, item);
}

async function initializeR11s(server: string, pathname: string) {
    const path = pathname.split("/");
    const tenantId = path[2];
    const documentId = path[3];

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

const officeServers = [
    "weuprodprv.www.office.com",
    "ncuprodprv.www.office.com",
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
            return initializeODSP(server, url.pathname);
        } else if (r11sServers.indexOf(server) !== -1) {
            return initializeR11s(server, url.pathname);
        }
        return Promise.reject(`Unknown URL ${paramURL}`);
    }
    return Promise.reject("Missing URL");
}

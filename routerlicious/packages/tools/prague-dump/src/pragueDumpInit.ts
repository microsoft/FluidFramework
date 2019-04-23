// tslint:disable:object-literal-sort-keys
import { IDocumentService, ITokenProvider } from "@prague/container-definitions";
import * as odsp from "@prague/odsp-socket-storage";
import * as r11s from "@prague/routerlicious-socket-storage";

import * as http from "http";
import * as request from "request";
import { URL } from "url";

import { paramJWT, paramURL } from "./pragueDumpArgs";
import { loadRC, saveRC } from "./pragueToolRC";

export let paramDocumentService: IDocumentService;
export let paramTenantId: string;
export let paramId: string;

export let connectionInfo: any;

const clientId = "3d642166-9884-4463-8248-78961b8c1300";

// TODO: put this somewhere else
const clientSecret = "IefegJIsumWtD1Of/9AIUWvm6ryR624vgMtKRmcNEsQ=";
const redirectUri = "http://localhost:7000/auth/callback";

async function getAuthorizationCode(server: string): Promise<string> {
    console.log("Please open browser and navigate to this URL:");
    console.log(`  https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?`
        + `client_id=${clientId}`
        + `&scope=https://${server}/MyFiles.Write`
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

async function loadAccessToken(server: string): Promise<string | undefined> {
    const rc = await loadRC();
    const tokens = rc.tokens;
    if (!tokens) {
        return undefined;
    }
    const serverTokens = tokens[server];
    if (!serverTokens) {
        return undefined;
    }
    return serverTokens.accessToken;
}

async function loadRefreshToken(server: string): Promise<string | undefined> {
    const rc = await loadRC();
    const tokens = rc.tokens;
    if (!tokens) {
        return undefined;
    }
    const serverTokens = tokens[server];
    if (!serverTokens) {
        return undefined;
    }
    return serverTokens.refreshToken;
}

async function saveAccessToken(server: string, accessToken: string, refreshToken: string) {
    const rc = await loadRC();
    let tokens = rc.tokens;
    if (!tokens) {
        tokens = {};
        rc.tokens = tokens;
    }
    tokens[server] = { accessToken, refreshToken };
    return saveRC(rc);
}

function getRefreshAccessTokenBody(server: string, lastRefreshToken: string) {
    return `scope=offline_access https://${server}/MyFiles.Write`
        + `&client_id=${clientId}`
        + `&client_secret=${clientSecret}`
        + `&grant_type=refresh_token`
        + `&refresh_token=${lastRefreshToken}`;
}

async function getRequestAccessTokenBody(server: string) {
    return `scope=offline_access https://${server}/MyFiles.Write`
        + `&client_id=${clientId}`
        + `&client_secret=${clientSecret}`
        + `&grant_type=authorization_code`
        + `&code=${await getAuthorizationCode(server)}`
        + `&redirect_uri=${redirectUri}`;
}

async function postTokenRequest(postBody: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const tokenUrl = "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";

        request.post({ url: tokenUrl, body: postBody },
            (error, response, body) => {
                if (error) {
                    reject(error);
                    return;
                }
                const parsed = JSON.parse(body);
                resolve(parsed);
            });
    });
}

async function processTokenBody(server: string, parsed: any) {
    const accessToken = parsed.access_token;
    const refreshToken = parsed.refresh_token;
    if (accessToken === undefined || refreshToken === undefined) {
        return undefined;
    }
    await saveAccessToken(server, accessToken, refreshToken);
    return accessToken;
}
async function refreshAccessToken(server: string, lastRefreshToken: string): Promise<string | undefined> {
    console.log("Refreshing access token");
    const parsed = await postTokenRequest(getRefreshAccessTokenBody(server, lastRefreshToken));
    return processTokenBody(server, parsed);
}

async function requestAccessToken(server: string): Promise<string> {
    const lastRefreshToken = await loadRefreshToken(server);
    let parsed;
    if (lastRefreshToken !== undefined) {
        const token = await refreshAccessToken(server, lastRefreshToken);
        if (token !== undefined) {
            return token;
        }
    }
    console.log("Acquiring tokens");
    parsed = await postTokenRequest(await getRequestAccessTokenBody(server));
    const accessToken = await processTokenBody(server, parsed);
    if (accessToken === undefined) {
        return Promise.reject(`Unable to get token\n${JSON.stringify(parsed, undefined, 2)} `);
    }
    return accessToken;
}

async function getAccessToken(server: string): Promise<string> {
    const accessToken = await loadAccessToken(server);
    if (accessToken === undefined) {
        return requestAccessToken(server);
    }
    return accessToken;
}

async function postAsync(uri: string, token: string): Promise<any> {
    return new Promise((resolve, reject) => {
        request.post(uri, { auth: { bearer: token } }, (error, response, body) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(JSON.parse(body));
        });
    });
}
async function joinODSPSession(
    server: string,
    prefix: string,
    documentDrive: string,
    documentItem: string): Promise<any> {

    // TODO: Detect token expire and refresh
    const joinSessionUri =
        `https://${server}${prefix}/_api/v2.1/drives/` +
        `${documentDrive}/items/${documentItem}/opStream/joinSession`;

    const parsedBody = await postAsync(joinSessionUri, await getAccessToken(server));

    if (parsedBody.error && parsedBody.error.innerError && parsedBody.error.innerError.code === "expiredToken") {
        return postAsync(joinSessionUri, await requestAccessToken(server));
    }
    return parsedBody;
}

async function initializeODSPCore(server: string, prefix: string, drive: string, item: string) {

    connectionInfo = {
        server,
        prefix,
        drive,
        item,
    };

    console.log(`Connecting to ODSP:\n  prefix=${prefix}\n  drive=${drive}\n  item=${item}`);

    const parsedBody = await joinODSPSession(server, prefix, drive, item);
    if (parsedBody.error) {
        const responseMsg = JSON.stringify(parsedBody.error, undefined, 2);
        return Promise.reject(`Fail to connect to ODSP server\nError Response:\n${responseMsg}`);
    }
    const tokenProvider = new odsp.TokenProvider(parsedBody.storageToken, parsedBody.socketToken);
    paramDocumentService =
        new odsp.DocumentService(
            parsedBody.snapshotStorageUrl,
            parsedBody.deltaStorageUrl,
            parsedBody.deltaStreamSocketUrl,
            tokenProvider);
    paramTenantId = parsedBody.runtimeTenantId;
    paramId = parsedBody.id;
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
    const prefix = url.pathname;
    return initializeODSPCore(server, prefix, drive, item);
}

async function initializeODSP(
    server: string,
    pathname: string) {

    const odspMatch = pathname.match(
        /(.*)\/_api\/v2.1\/drives\/([^\/]*)\/items\/([^\/]*)(.*)/);

    if (odspMatch === null) {
        return Promise.reject("Unable to parse ODSP URL path");
    }
    const prefix = odspMatch[1];
    const drive = odspMatch[2];
    const item = odspMatch[3];

    return initializeODSPCore(server, prefix, drive, item);
}

async function initializeR11s(server: string, pathname: string) {
    const path = pathname.split("/");
    paramTenantId = path[2];
    paramId = path[3];

    connectionInfo = {
        server,
        tenantId: paramTenantId,
        id: paramId,
    };

    const serverSuffix = server.substring(4);
    console.log(`Connecting to r11s: tenantId=${paramTenantId} id:${paramId}`);
    const tokenProvider = new r11s.TokenProvider(paramJWT);
    paramDocumentService = r11s.createDocumentService(
        `https://alfred.${serverSuffix}`,
        `https://alfred.${serverSuffix}/deltas/${paramTenantId}/${paramId}`,
        `https://historian.${serverSuffix}/repos/${paramTenantId}`,
        tokenProvider);
}

const officeServers = [
    "weuprodprv.www.office.com",
    "ncuprodprv.www.office.com",
];

const odspServers = [
    "microsoft-my.sharepoint-df.com",
    "microsoft-my.sharepoint.com",
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

// tslint:disable:object-literal-sort-keys
import { IDocumentService, ITokenProvider } from "@prague/container-definitions";
import * as odsp from "@prague/odsp-socket-storage";
import * as r11s from "@prague/routerlicious-socket-storage";
import * as request from "request";
import { URL } from "url";
import { paramJWT, paramURL } from "./pragueDumpArgs";

export let paramDocumentService: IDocumentService;
export let paramTokenProvider: ITokenProvider;
export let paramTenantId: string;
export let paramId: string;

export let connectionInfo: any;

async function joinODSPSession(
    server: string,
    prefix: string,
    documentDrive: string,
    documentItem: string,
    token: string): Promise<any> {
    const joinSessionUri =
        `https://${server}${prefix}/_api/v2.1/drives/` +
        `${documentDrive}/items/${documentItem}/opStream/joinSession`;
    return new Promise((resolve, reject) => {
        request.post(joinSessionUri, { auth: { bearer: token } }, (error, response, body) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(JSON.parse(body));
        });
    });
}

async function initializeODSP(
    server: string,
    pathname: string,
    token: string) {

    const odspMatch = pathname.match(
        // tslint:disable-next-line:max-line-length
        /(.*)\/_api\/v2.1\/drives\/([^\/]*)\/items\/([^\/]*)(.*)/);

    if (odspMatch === null) {
        return Promise.reject("Unable to parse ODSP URL path");
    }
    const prefix = odspMatch[1];
    const drive = odspMatch[2];
    const item = odspMatch[3];

    connectionInfo = {
        server,
        prefix,
        drive,
        item,
    };

    console.log(`Connecting to ODSP:\n  prefix=${prefix}\n  drive=${drive}\n  item=${item}`);
    const parsedBody = await joinODSPSession(server, prefix, drive, item, token);
    if (parsedBody.error) {
        const responseMsg = JSON.stringify(parsedBody.error, undefined, 2);
        return Promise.reject(`Fail to connect to ODSP server\nError Response:\n${responseMsg}`);
    }
    paramDocumentService = new odsp.DocumentService(
        parsedBody.snapshotStorageUrl, parsedBody.deltaStorageUrl, parsedBody.deltaStreamSocketUrl);
    paramTokenProvider = await paramDocumentService.createTokenProvider(
        { storageToken: token, socketToken: parsedBody.socketToken });
    paramTenantId = parsedBody.runtimeTenantId;
    paramId = parsedBody.id;
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
    paramDocumentService = r11s.createDocumentService(
        `https://alfred.${serverSuffix}`,
        `https://alfred.${serverSuffix}/deltas/${paramTenantId}/${paramId}`,
        `https://historian.${serverSuffix}/repos/${paramTenantId}`);
    paramTokenProvider = await paramDocumentService.createTokenProvider({ jwt: paramJWT });
}

const odspServers = [
    "microsoft-my.sharepoint-df.com",
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
        if (odspServers.indexOf(server) !== -1) {
            const token = url.searchParams.get("access_token");
            if (token === null) {
                return Promise.reject(`Missing ODSP access_token`);
            }
            return initializeODSP(server, url.pathname, token);
        } else {
            if (r11sServers.indexOf(server) !== -1) {
                return initializeR11s(server, url.pathname);
            }
        }
        return Promise.reject(`Unknown URL ${paramURL}`);
    }
    return Promise.reject("Missing URL");
}

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

async function joinODSPSession(documentDrive: string, documentItem: string, token: string): Promise<any> {
    const joinSessionUri =
        `https://microsoft-my.sharepoint-df.com/_api/v2.1/drives/` +
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

async function initializeODSP(documentDrive: string, documentItem: string, token: string) {
    console.log(`Connecting to ODSP: drive=${documentDrive} item:${documentItem}`);
    const parsedBody = await joinODSPSession(documentDrive, documentItem, token);
    if (parsedBody.error) {
        console.log(parsedBody.error);
        return;
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

    console.log(`Connecting to r11s: tenantId=${paramTenantId} id:${paramId}`);
    paramDocumentService = r11s.createDocumentService(
        `https://alfred.${server}`,
        `https://alfred.${server}/deltas/${paramTenantId}/${paramId}`,
        `https://historian.${server}/repos/${paramTenantId}`);
    paramTokenProvider = await paramDocumentService.createTokenProvider({ jwt: paramJWT });
}

const servers = [
    "www.wu2-ppe.prague.office-int.com",
    "www.wu2.prague.office-int.com",
    "www.eu.prague.office-int.com",
];
export async function pragueDumpInit() {
    if (paramURL) {
        const odspMatch = paramURL.match(
            // tslint:disable-next-line:max-line-length
            /https:\/\/microsoft-my.sharepoint-df.com\/_api\/v2.1\/drives\/([^\/]*)\/items\/([^\/]*)\/opStream\/joinSession\?access_token=(.*)/);
        if (odspMatch) {
            return initializeODSP(odspMatch[1], odspMatch[2], odspMatch[3]);
        } else {
            const url = new URL(paramURL);
            if (servers.indexOf(url.hostname.toLowerCase()) !== -1) {
                return initializeR11s(url.hostname.substring(4), url.pathname);
            }
        }
        return Promise.reject(`Unknown URL ${paramURL}`);
    }
    return Promise.reject("Missing URL");
}

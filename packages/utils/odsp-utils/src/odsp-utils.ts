/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as request from "request";

export interface IODSPTokens {
    accessToken: string;
    refreshToken: string;
}

export interface IClientConfig {
    clientId: string;
    clientSecret: string;
}

export interface IODSPDriveItem {
    drive: string;
    item: string;
}

interface IRequestResult {
    href: string;
    status: number;
    data: any;
}

function createRequestResult(response: request.Response, body: any): IRequestResult {
    // console.log(JSON.stringify(response, undefined, 2));
    // console.log(JSON.stringify(body, undefined, 2));
    return { href: response.request.uri.href, status: response.statusCode, data: body };
}

function createRequestError(msg: string, requestResult: IRequestResult) {
    const error = new Error(msg);
    (error as any).requestResult = requestResult;
    return error;
}

function getRefreshAccessTokenBody(server: string, clientConfig: IClientConfig, lastRefreshToken: string) {
    return `scope=offline_access https://${server}/AllSites.Write`
        + `&client_id=${clientConfig.clientId}`
        + `&client_secret=${clientConfig.clientSecret}`
        + `&grant_type=refresh_token`
        + `&refresh_token=${lastRefreshToken}`;
}

async function processTokenBody(requestResult: IRequestResult): Promise<IODSPTokens> {
    const parsed = JSON.parse(requestResult.data);
    const accessToken = parsed.access_token;
    const refreshToken = parsed.refresh_token;
    if (accessToken === undefined || refreshToken === undefined) {
        return Promise.reject(createRequestError("Unable to refresh access token", requestResult));
    }
    return { accessToken, refreshToken };
}

export function getTenant(server: string) {
    const tenant = server.substr(0, server.indexOf("."));
    return (tenant === "microsoft" || tenant === "microsoft-my") ? "organizations" : `${tenant}.onmicrosoft.com`;
}

export async function postTokenRequest(server: string, postBody: string): Promise<IODSPTokens> {
    return new Promise((resolve, reject) => {
        const tokenUrl = `https://login.microsoftonline.com/${getTenant(server)}/oauth2/v2.0/token`;

        request.post({ url: tokenUrl, body: postBody },
            (error, response, body) => {
                if (error) {
                    reject(createRequestError("Error getting the token", error));
                    return;
                }
                resolve(processTokenBody(createRequestResult(response, body)));
            });
    });
}

export async function refreshAccessToken(server: string, clientConfig: IClientConfig, tokens: IODSPTokens) {
    console.log("Refreshing access token");
    tokens.accessToken = "";
    const odspTokens = await postTokenRequest(server,
        getRefreshAccessTokenBody(server, clientConfig, tokens.refreshToken));
    tokens.accessToken = odspTokens.accessToken;
    tokens.refreshToken = odspTokens.refreshToken;
    return odspTokens;
}

async function requestWithRefresh(
    server: string,
    clientConfig: IClientConfig,
    tokens: IODSPTokens,
    requestCallback: (token: string) => Promise<any>): Promise<any> {

    const result = await requestCallback(tokens.accessToken);
    if (result.status !== 401 && result.status !== 403) {
        return result;
    }
    // Unauthorized, try to refresh the token
    const odspTokens = await refreshAccessToken(server, clientConfig, tokens);
    return requestCallback(odspTokens.accessToken);
}

function getRequestHandler(resolve, reject) {
    return (error, response, body) => {
        if (error) {
            // console.error(`ERROR: request error\n${JSON.stringify(error, undefined, 2)}`);
            reject(createRequestError("request error", error));
            return;
        }
        resolve(createRequestResult(response, body));
    };
}

async function getAsync(
    server: string,
    clientConfig: IClientConfig,
    tokens: IODSPTokens,
    url: string,
    headers?: any): Promise<IRequestResult> {

    return requestWithRefresh(server, clientConfig, tokens, async (token: string) => {
        return new Promise((resolve, reject) => {
            // console.log(`GET: ${url}`);
            request.get({ url, headers, auth: { bearer: token } }, getRequestHandler(resolve, reject));
        });
    });
}

async function putAsync(
    server: string,
    clientConfig: IClientConfig,
    tokens: IODSPTokens,
    url: string,
    headers?: any): Promise<IRequestResult> {

    return requestWithRefresh(server, clientConfig, tokens, async (token: string) => {
        return new Promise((resolve, reject) => {
            // console.log(`PUT: ${url}`);
            request.put({ url, headers, auth: { bearer: token } }, getRequestHandler(resolve, reject));
        });
    });
}

interface IODSPUser {
    displayName: string;
    email?: string;
    id?: string;
}

interface IODSPGroup {
    displayName: string;
    email?: string;
}

interface IODSPDriveQuota {
    deleted: number;
    fileCount: number;
    remaining: number;
    state: string;
    total: number;
    used: number;
}

interface IODSPEntity {
    user?: IODSPUser;
    group?: IODSPGroup;
}

interface IODSPDriveInfo {
    id: string;
    createdDateTime: string;
    description: string;
    driveType: string;
    lastModifiedDateTime: string;
    name: string;
    webUrl: string;
    createdBy: IODSPEntity;
    lastModifiedBy: IODSPEntity;
    owner: IODSPEntity;
    quota: IODSPDriveQuota;
}

async function getDrives(server: string, account: string, clientConfig: IClientConfig, tokens: IODSPTokens) {
    const getDriveUrl = `https://${server}/${account}/_api/v2.1/drives`;
    const getDriveResult = await getAsync(server, clientConfig, tokens, getDriveUrl);
    if (getDriveResult.status !== 200) {
        return Promise.reject(getDriveResult);
    }
    const parsedBody = JSON.parse(getDriveResult.data);
    return parsedBody.value as IODSPDriveInfo[];
}

async function getDriveId(
    server: string,
    account: string,
    path: string,
    clientConfig: IClientConfig,
    tokens: IODSPTokens,
) {
    const drives = await getDrives(server, account, clientConfig, tokens);
    const drivePath = encodeURI(`https://${server}/${account}/${path.split("/")[0]}`);
    const index = drives.findIndex((value) => value.webUrl === drivePath);
    if (index === -1) {
        return Promise.reject(new Error(`Drive ${drivePath} not found.`));
    }
    return drives[index].id;
}

export async function getDriveItemByFileId(
    server: string,
    account: string,
    uid: string,
    clientConfig: IClientConfig,
    tokens: IODSPTokens,
): Promise<IODSPDriveItem> {
    const getFileByIdUrl = `https://${server}/${account}/_api/web/GetFileById('${uid}')`;
    const getFileByIdResult = await getAsync(server, clientConfig, tokens,
        getFileByIdUrl, { accept: "application/json" });

    if (getFileByIdResult.status !== 200) {
        return Promise.reject(getFileByIdResult);
    }
    const parsedBody = JSON.parse(getFileByIdResult.data);
    const serverRelativeUrl = parsedBody.ServerRelativeUrl;
    return getDriveItemByServerRelativePath(server, serverRelativeUrl, clientConfig, tokens);
}

export async function getDriveItemByServerRelativePath(
    server: string,
    serverRelativePath: string,
    clientConfig: IClientConfig,
    tokens: IODSPTokens,
): Promise<IODSPDriveItem> {
    const documentPathMatch = serverRelativePath.match(/\/(personal|teams)\/(.*)\/(.*)\/(.*)/i);
    if (documentPathMatch === null) {
        return Promise.reject(new Error("serverRelativePath is not in the right format"));
    }
    const account = `${documentPathMatch[1]}/${documentPathMatch[2]}`;
    const library = documentPathMatch[3];
    const path = documentPathMatch[4];
    const driveId = await getDriveId(server, account, library, clientConfig, tokens);
    const getDriveItemUrl = `https://${server}/_api/v2.1/drives/${driveId}/root:/${path}:`;
    const getDriveItemResult = await getAsync(server, clientConfig, tokens,
        getDriveItemUrl, { accept: "application/json" });
    if (getDriveItemResult.status !== 200) {
        return Promise.reject(getDriveItemResult);
    }

    const parsedDriveItemBody = JSON.parse(getDriveItemResult.data);
    return { drive: parsedDriveItemBody.parentReference.driveId, item: parsedDriveItemBody.id };
}

export async function getDriveItemByRootFileName(
    server: string,
    account: string,
    path: string,
    clientConfig: IClientConfig,
    tokens: IODSPTokens,
    create: boolean = false,
): Promise<IODSPDriveItem> {
    const accountPath = account ? `/${account}` : "";
    const getDriveItemUrl = `https://${server}${accountPath}/_api/v2.1/drive/root:${path}:`;
    let getDriveItemResult = await getAsync(server, clientConfig, tokens, getDriveItemUrl);
    if (getDriveItemResult.status !== 200) {
        if (!create) {
            return Promise.reject(createRequestError("Unable to get drive/item id from path", getDriveItemResult));
        }
        // try createing the file
        const contentUri = `${getDriveItemUrl}:/content`;
        const createResult = await putAsync(server, clientConfig, tokens, contentUri);
        if (createResult.status !== 201) {
            return Promise.reject(createRequestError("Failed to create file", createResult));
        }

        getDriveItemResult = await getAsync(server, clientConfig, tokens, getDriveItemUrl);
        if (getDriveItemResult.status !== 200) {
            return Promise.reject(createRequestError("Unable to get drive/item id from path", getDriveItemResult));
        }
    }
    const parsedDriveItemBody = JSON.parse(getDriveItemResult.data);
    return { drive: parsedDriveItemBody.parentReference.driveId, item: parsedDriveItemBody.id };
}

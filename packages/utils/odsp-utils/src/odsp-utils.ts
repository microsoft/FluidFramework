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

export async function postTokenRequest(postBody: string): Promise<IODSPTokens> {
    return new Promise((resolve, reject) => {
        const tokenUrl = "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";

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

async function refreshAccessToken(server: string, clientConfig: IClientConfig, tokens: IODSPTokens) {
    console.log("Refreshing access token");
    tokens.accessToken = "";
    const odspTokens = await postTokenRequest(getRefreshAccessTokenBody(server, clientConfig, tokens.refreshToken));
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
    const path = parsedBody.ServerRelativeUrl;
    const documentPathMatch = path.match(/\/(personal|teams)\/(.*)\/(Shared )?Documents\/(.*)/i);
    if (documentPathMatch === null) {
        return Promise.reject(createRequestError("Unable to match file name from file Id", getFileByIdResult));
    }

    if (`${documentPathMatch[1]}/${documentPathMatch[2]}`.toLowerCase() !== account.toLowerCase()) {
        return Promise.reject(
            createRequestError("File URL doesn't match expected account from file Id", getFileByIdResult));
    }

    const fileName = documentPathMatch[4];
    if (!fileName) {
        return Promise.reject(createRequestError("Filename missing from URL from file Id", getFileByIdResult));
    }

    return getDriveItemByFileName(server, account, `/${fileName}`, clientConfig, tokens, false);
}

export async function getDriveItemByFileName(
    server: string,
    account: string,
    path: string,
    clientConfig: IClientConfig,
    tokens: IODSPTokens,
    create: boolean = false,
): Promise<IODSPDriveItem> {
    const accountPath = account ? `/${account}` : "";
    const getDriveItemUrl = `https://${server}${accountPath}/_api/v2.1/drive/root:${path}`;
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

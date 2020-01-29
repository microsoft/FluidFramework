/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import Axios, { AxiosResponse, AxiosRequestConfig } from "axios";

export interface IODSPTokens {
    accessToken: string;
    refreshToken: string;
}

export interface IClientConfig {
    clientId: string;
    clientSecret: string;
}

export interface IODSPDriveItem {
    path: string;
    name: string;
    drive: string;
    item: string;
    isFolder: boolean;
}

interface IRequestResult {
    href: string | undefined;
    status: number;
    data: any;
}

function createRequestResult(response: AxiosResponse): IRequestResult {
    // console.log(JSON.stringify(response, undefined, 2));
    // console.log(JSON.stringify(body, undefined, 2));
    return { href: response.config.url, status: response.status, data: response.data };
}

function createRequestError(msg: string, requestResult?: IRequestResult, response?: any) {
    const error: any = new Error(msg);
    if (requestResult) {
        error.requestResult = requestResult;
    }
    if (response?.response) {
        error.href = response.response.config.url;
        error.status = response.response.status;
        error.data = response.response.data;
    }
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
    const accessToken = requestResult.data.access_token;
    const refreshToken = requestResult.data.refresh_token;
    if (accessToken === undefined || refreshToken === undefined) {
        return Promise.reject(createRequestError("Unable to refresh access token", requestResult));
    }
    return { accessToken, refreshToken };
}

export function isSharepointURL(server: string) {
    return server.endsWith("sharepoint.com") || server.endsWith("sharepoint-df.com");
}

export function getSharepointTenant(server: string) {
    let tenant = server.substr(0, server.indexOf("."));
    if (tenant.endsWith("-my")) {
        tenant = tenant.substr(0, tenant.length - 3);
    }
    return tenant === "microsoft" ? "organizations" : `${tenant}.onmicrosoft.com`;
}

export async function postTokenRequest(server: string, postBody: string): Promise<IODSPTokens> {
    const tokenUrl = `https://login.microsoftonline.com/${getSharepointTenant(server)}/oauth2/v2.0/token`;

    let response: AxiosResponse;
    try {
        response = await Axios.post(tokenUrl, postBody);
    } catch (error) {
        throw createRequestError("Error getting the token", undefined, error);
    }

    return processTokenBody(createRequestResult(response));
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

export async function refreshAccessToken(server: string, clientConfig: IClientConfig, tokens: IODSPTokens) {
    console.log("Refreshing access token");
    tokens.accessToken = "";
    const odspTokens = await postTokenRequest(server,
        getRefreshAccessTokenBody(server, clientConfig, tokens.refreshToken));
    tokens.accessToken = odspTokens.accessToken;
    tokens.refreshToken = odspTokens.refreshToken;
    return odspTokens;
}

async function axiosRequest(
    request: (config: AxiosRequestConfig) => Promise<AxiosResponse>,
    token: string,
): Promise<IRequestResult> {
    let response: AxiosResponse;
    try {
        const config = { headers: { ...Headers, Authorization: `Bearer ${token}` } };
        response = await request(config);
    } catch (error) {
        if (error?.response && error.response.status) {
            response = error.response;
        } else {
            throw createRequestError("request error", undefined, error);
        }
    }
    return createRequestResult(response);
}

async function getAsync(
    server: string,
    clientConfig: IClientConfig,
    tokens: IODSPTokens,
    url: string,
    headers?: any): Promise<IRequestResult> {

    return requestWithRefresh(server, clientConfig, tokens, async (token: string) => {
        // console.log(`GET: ${url}`);
        return axiosRequest(async (config) => Axios.get(url, config), token);
    });
}

async function putAsync(
    server: string,
    clientConfig: IClientConfig,
    tokens: IODSPTokens,
    url: string,
    headers?: any): Promise<IRequestResult> {

    return requestWithRefresh(server, clientConfig, tokens, async (token: string) => {
        // console.log(`PUT: ${url}`);
        return axiosRequest(async (config) => Axios.put(url, config), token);
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
    const accountPath = account ? `/${account}` : "";
    const getDriveUrl = `https://${server}${accountPath}/_api/v2.1/drives`;
    const getDriveResult = await getAsync(server, clientConfig, tokens, getDriveUrl);
    if (getDriveResult.status !== 200) {
        return Promise.reject(getDriveResult);
    }
    return getDriveResult.data as IODSPDriveInfo[];
}

async function getDriveId(
    server: string,
    account: string,
    library: string,
    clientConfig: IClientConfig,
    tokens: IODSPTokens,
) {
    const drives = await getDrives(server, account, clientConfig, tokens);
    const accountPath = account ? `/${account}` : "";
    const drivePath = encodeURI(`https://${server}${accountPath}/${library}`);
    const index = drives.findIndex((value) => value.webUrl === drivePath);
    if (index === -1) {
        return Promise.reject(new Error(`Drive ${drivePath} not found.`));
    }
    return drives[index].id;
}

/* Unused
export async function getDriveItemByFileId(
    server: string,
    account: string,
    uid: string,
    clientConfig: IClientConfig,
    tokens: IODSPTokens,
): Promise<IODSPDriveItem> {
    const accountPath = account? `/${account}` : "";
    const getFileByIdUrl = `https://${server}${accountPath}/_api/web/GetFileById('${uid}')`;
    const getFileByIdResult = await getAsync(server, clientConfig, tokens,
        getFileByIdUrl, { accept: "application/json" });

    if (getFileByIdResult.status !== 200) {
        return Promise.reject(getFileByIdResult);
    }
    const parsedBody = JSON.parse(getFileByIdResult.data);
    const serverRelativeUrl = parsedBody.ServerRelativeUrl;
    return getDriveItemByServerRelativePath(server, serverRelativeUrl, clientConfig, tokens);
}
*/

export async function getDriveItemByServerRelativePath(
    server: string,
    serverRelativePath: string,
    clientConfig: IClientConfig,
    tokens: IODSPTokens,
    create: boolean = false,
): Promise<IODSPDriveItem> {
    let account = "";
    const pathParts = serverRelativePath.split("/");
    if (serverRelativePath.startsWith("/")) {
        pathParts.shift();
    }
    if (pathParts.length === 0) {
        return Promise.reject(new Error(`Invalid serverRelativePath ${serverRelativePath}`));
    }
    if (pathParts.length >= 2 &&
        (pathParts[0] === "personal" || pathParts[0] === "teams" || pathParts[0] === "sites")) {
        account = `${pathParts.shift()}/${pathParts.shift()}`;
    }

    const library = pathParts.shift();
    if (!library) {
        // Default drive/library
        return getDriveItemByRootFileName(server, account, "/", clientConfig, tokens, create);
    }
    const path = `/${pathParts.join("/")}`;
    const driveId = await getDriveId(server, account, library, clientConfig, tokens);
    const getDriveItemUrl = `https://${server}/_api/v2.1/drives/${driveId}/root:${path}:`;
    return getDriveItem(server, clientConfig, tokens, getDriveItemUrl, create);
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
    return getDriveItem(server, clientConfig, tokens, getDriveItemUrl, create);
}

async function getDriveItem(
    server: string,
    clientConfig: IClientConfig,
    tokens: IODSPTokens,
    getDriveItemUrl: string,
    create: boolean,
): Promise<IODSPDriveItem> {
    let getDriveItemResult = await getAsync(server, clientConfig, tokens, getDriveItemUrl);
    if (getDriveItemResult.status !== 200) {
        if (!create) {
            return Promise.reject(createRequestError("Unable to get drive/item id from path", getDriveItemResult));
        }
        // Try creating the file
        const contentUri = `${getDriveItemUrl}/content`;
        const createResult = await putAsync(server, clientConfig, tokens, contentUri);
        if (createResult.status !== 201) {
            return Promise.reject(createRequestError("Failed to create file", createResult));
        }

        getDriveItemResult = await getAsync(server, clientConfig, tokens, getDriveItemUrl);
        if (getDriveItemResult.status !== 200) {
            return Promise.reject(createRequestError("Unable to get drive/item id from path", getDriveItemResult));
        }
    }
    return toIODSPDriveItem(getDriveItemResult.data);
}

export async function getChildrenByDriveItem(
    server: string,
    driveItem: IODSPDriveItem,
    clientConfig: IClientConfig,
    tokens: IODSPTokens,
): Promise<IODSPDriveItem[]> {
    if (!driveItem.isFolder) { return []; }
    let getChildrenUrl = `https://${server}/_api/v2.1/drives/${driveItem.drive}/items/${driveItem.item}/children`;
    let children: any[] = [];
    do {
        const getChildrenResult = await getAsync(server, clientConfig, tokens, getChildrenUrl);
        if (getChildrenResult.status !== 200) {
            return Promise.reject(createRequestError("Unable to get children", getChildrenResult));
        }
        children = children.concat(getChildrenResult.data.value);
        getChildrenUrl = getChildrenResult.data["@odata.nextLink"];
    } while (getChildrenUrl);
    return children.map(toIODSPDriveItem);
}

function toIODSPDriveItem(parsedDriveItemBody: any) {
    const path = parsedDriveItemBody.parentReference.path ?
        parsedDriveItemBody.parentReference.path.split("root:")[1] : "/";
    return {
        path,
        name: parsedDriveItemBody.name,
        drive: parsedDriveItemBody.parentReference.driveId,
        item: parsedDriveItemBody.id,
        isFolder: !!parsedDriveItemBody.folder,
    };
}

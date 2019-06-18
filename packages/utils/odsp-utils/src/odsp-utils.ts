/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPragueResolvedUrl } from "@prague/container-definitions";
import * as request from "request";

export interface IODSPTokens {
    accessToken: string;
    refreshToken: string;
}

export interface IClientConfig {
    clientId: string;
    clientSecret: string;
}

function getRequestHandler(resolve, reject) {
    return (error, response, body) => {
        if (error) {
            console.error(`ERROR: request error\n${JSON.stringify(error, undefined, 2)}`);
            reject(error);
            return;
        }
        resolve({ status: response.statusCode, data: body });
    };
}

async function postAsync(uri: string, token: string): Promise<any> {
    return new Promise((resolve, reject) => {
        // console.log(`POST: ${uri}`);
        request.post(uri, { auth: { bearer: token } }, getRequestHandler(resolve, reject));
    });
}

async function putAsync(uri: string, token: string): Promise<any> {
    return new Promise((resolve, reject) => {
        // console.log(`PUT: ${uri}`);
        request.put(uri, { auth: { bearer: token } }, getRequestHandler(resolve, reject));
    });
}

function getRefreshAccessTokenBody(server: string, clientConfig: IClientConfig, lastRefreshToken: string) {
    return `scope=offline_access https://${server}/AllSite.Write`
        + `&client_id=${clientConfig.clientId}`
        + `&client_secret=${clientConfig.clientSecret}`
        + `&grant_type=refresh_token`
        + `&refresh_token=${lastRefreshToken}`;
}

async function processTokenBody(parsed: any): Promise<IODSPTokens> {
    const accessToken = parsed.access_token;
    const refreshToken = parsed.refresh_token;
    if (accessToken === undefined || refreshToken === undefined) {
        return Promise.reject(`Unable to get token\n${JSON.stringify(parsed, undefined, 2)} `);
    }
    return { accessToken, refreshToken };
}

export async function postTokenRequest(postBody: string): Promise<IODSPTokens> {
    return new Promise((resolve, reject) => {
        const tokenUrl = "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";

        request.post({ url: tokenUrl, body: postBody },
            (error, response, body) => {
                if (error) {
                    reject(error);
                    return;
                }
                const parsed = JSON.parse(body);
                resolve(processTokenBody(parsed));
            });
    });
}

async function refreshAccessToken(server: string, clientConfig: IClientConfig, tokens: IODSPTokens) {
    console.log("Refreshing access token");
    const odspTokens = await postTokenRequest(getRefreshAccessTokenBody(server, clientConfig, tokens.refreshToken));
    tokens.accessToken = odspTokens.accessToken;
    tokens.refreshToken = odspTokens.refreshToken;
    return odspTokens;
}

export async function getODSPPragueResolvedUrl(
    server: string,
    path: string,
    tokens: IODSPTokens,
    clientConfig: IClientConfig,
    create: boolean = false): Promise<IPragueResolvedUrl> {

    const baseUri = `https://${server}/_api/v2.1/${path}`;
    const joinSessionUri = `${baseUri}/opStream/joinSession`;
    let joinSessionResult = await postAsync(joinSessionUri, tokens.accessToken);

    if (joinSessionResult.status === 401) {
        // Unauthorized, try to refresh the token
        const odspTokens = await refreshAccessToken(server, clientConfig, tokens);
        joinSessionResult = await postAsync(joinSessionUri, odspTokens.accessToken);
    }
    if (joinSessionResult.status === 308) {
        // Redirects
        // TODO: reject for now
        return Promise.reject(joinSessionResult);
    }
    if (joinSessionResult.status !== 200) {
        if (!create) {
            return Promise.reject(joinSessionResult);
        }
        // Try to create it
        const contentUri = `${baseUri}/content`;
        const createResult = await putAsync(contentUri, tokens.accessToken);
        if (createResult.status !== 201) {
            return Promise.reject(createResult);
        }

        joinSessionResult = await postAsync(joinSessionUri, tokens.accessToken);
        if (joinSessionResult.status !== 200) {
            return Promise.reject(joinSessionResult);
        }
    }
    const parsedBody = JSON.parse(joinSessionResult.data);
    return {
        endpoints: {
            deltaStorageUrl: parsedBody.deltaStorageUrl,
            ordererUrl: parsedBody.deltaStreamSocketUrl,
            storageUrl: parsedBody.snapshotStorageUrl,
        },
        tokens: { storageToken: parsedBody.storageToken, socketToken: parsedBody.socketToken },
        type: "prague",
        url: `prague-odsp://${server}/` +
            `${encodeURIComponent(parsedBody.runtimeTenantId)}/${encodeURIComponent(parsedBody.id)}`,
    };
}

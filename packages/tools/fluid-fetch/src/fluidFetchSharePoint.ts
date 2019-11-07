/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    getChildrenByDriveItem,
    getDriveItemByServerRelativePath,
    IClientConfig,
    IODSPDriveItem,
    IODSPTokens,
} from "@microsoft/fluid-odsp-utils";
import { getClientConfig, getODSPTokens, saveAccessToken } from "./fluidFetchODSPTokens";

async function resolveWrapper<T>(
    callback: (tokens: IODSPTokens) => Promise<T>,
    server: string,
    clientConfig: IClientConfig,
    forceTokenReauth = false,
): Promise<T> {
    try {
        const odspTokens = await getODSPTokens(server, clientConfig, forceTokenReauth);
        const oldAccessToken = odspTokens.accessToken;
        try {
            const driveItem = await callback(odspTokens);
            return driveItem;
        } finally {
            if (oldAccessToken !== odspTokens.accessToken) {
                await saveAccessToken(server, odspTokens);
            }
        }
    } catch (e) {
        if (e.requestResultError) {
            const parsedBody = JSON.parse(e.requestResult.data);
            if (parsedBody.error === "invalid_grant"
                && parsedBody.suberror === "consent_required"
                && !forceTokenReauth
            ) {
                // Re-auth
                return resolveWrapper<T>(callback, server, clientConfig, true);
            }
            const responseMsg = JSON.stringify(parsedBody.error, undefined, 2);
            return Promise.reject(`Fail to connect to ODSP server\nError Response:\n${responseMsg}`);
        }
        throw e;
    }
}

export async function resolveDriveItemByServerRelativePath(
    server: string,
    serverRelativePath: string,
    clientConfig: IClientConfig,
) {
    return resolveWrapper<IODSPDriveItem>(
        (tokens) => getDriveItemByServerRelativePath(server, serverRelativePath, clientConfig, tokens),
        server, clientConfig);
}

async function resolveChildrenByDriveItem(
    server: string,
    folderDriveItem: IODSPDriveItem,
    clientConfig: IClientConfig,
) {
    return resolveWrapper<IODSPDriveItem[]>(
        (tokens) => getChildrenByDriveItem(server, folderDriveItem, clientConfig, tokens),
        server, clientConfig);
}

export async function getSharepointFiles(server: string, serverRelativePath: string, recurse: boolean) {
    const clientConfig = getClientConfig();

    const fileInfo = await resolveDriveItemByServerRelativePath(server, serverRelativePath, clientConfig);
    const pendingFolder: { path: string, folder: IODSPDriveItem }[] = [];
    const files: IODSPDriveItem[] = [];
    if (fileInfo.isFolder) {
        pendingFolder.push({ path: serverRelativePath, folder: fileInfo });
    } else {
        files.push(fileInfo);
    }

    while (true) {
        const folderInfo = pendingFolder.shift();
        if (!folderInfo) { break; }
        const { path, folder } = folderInfo;
        const children = await resolveChildrenByDriveItem(server, folder, clientConfig);
        for (const child of children) {
            const childPath = `${path}/${child.name}`;
            if (child.isFolder) {
                if (recurse) {
                    pendingFolder.push({ path: childPath, folder: child });
                }
            } else {
                files.push(child);
            }
        }
    }
    return files;
}

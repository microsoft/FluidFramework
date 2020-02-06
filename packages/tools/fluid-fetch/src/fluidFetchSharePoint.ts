/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    getChildrenByDriveItem,
    getDriveItemByServerRelativePath,
    IClientConfig,
    IOdspDriveItem,
    getOdspRefreshTokenFn,
    IOdspAuthRequestInfo,
} from "@microsoft/fluid-odsp-utils";
import { getMicrosoftConfiguration, OdspTokenManager, odspTokensCache } from "@microsoft/fluid-tool-utils";
import { fluidFetchWebNavigator } from "./fluidFetchInit";

async function resolveWrapper<T>(
    callback: (authRequestInfo: IOdspAuthRequestInfo) => Promise<T>,
    server: string,
    clientConfig: IClientConfig,
    forceTokenReauth = false,
): Promise<T> {
    try {
        const odspTokenManager = new OdspTokenManager(odspTokensCache);
        const tokens = await odspTokenManager.getOdspTokens(
            server,
            clientConfig,
            fluidFetchWebNavigator,
            undefined,
            undefined,
            forceTokenReauth,
        );

        return callback({
            accessToken: tokens.accessToken,
            refreshTokenFn: getOdspRefreshTokenFn(server, clientConfig, tokens),
        });
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
    return resolveWrapper<IOdspDriveItem>(
        // eslint-disable-next-line @typescript-eslint/promise-function-async
        (authRequestInfo) => getDriveItemByServerRelativePath(
            server,
            serverRelativePath,
            authRequestInfo,
            false,
        ),
        server, clientConfig);
}

async function resolveChildrenByDriveItem(
    server: string,
    folderDriveItem: IOdspDriveItem,
    clientConfig: IClientConfig,
) {
    return resolveWrapper<IOdspDriveItem[]>(
        // eslint-disable-next-line @typescript-eslint/promise-function-async
        (authRequestInfo) => getChildrenByDriveItem(folderDriveItem, server, authRequestInfo),
        server, clientConfig);
}

export async function getSharepointFiles(server: string, serverRelativePath: string, recurse: boolean) {
    const clientConfig = getMicrosoftConfiguration();

    const fileInfo = await resolveDriveItemByServerRelativePath(server, serverRelativePath, clientConfig);
    const pendingFolder: { path: string, folder: IOdspDriveItem }[] = [];
    const files: IOdspDriveItem[] = [];
    if (fileInfo.isFolder) {
        pendingFolder.push({ path: serverRelativePath, folder: fileInfo });
    } else {
        files.push(fileInfo);
    }

    // eslint-disable-next-line no-constant-condition
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

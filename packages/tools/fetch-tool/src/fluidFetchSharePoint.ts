/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DriverErrorType } from "@fluidframework/driver-definitions";
import {
    getChildrenByDriveItem,
    getDriveItemByServerRelativePath,
    getDriveItemFromDriveAndItem,
    IClientConfig,
    IOdspDriveItem,
    getOdspRefreshTokenFn,
    IOdspAuthRequestInfo,
} from "@fluidframework/odsp-doclib-utils";
import {
    getMicrosoftConfiguration,
    OdspTokenManager,
    odspTokensCache,
    OdspTokenConfig,
    IOdspTokenManagerCacheKey,
} from "@fluidframework/tool-utils";
import { fluidFetchWebNavigator } from "./fluidFetchInit";
import { getForceTokenReauth } from "./fluidFetchArgs";

export async function resolveWrapper<T>(
    callback: (authRequestInfo: IOdspAuthRequestInfo) => Promise<T>,
    server: string,
    clientConfig: IClientConfig,
    forceTokenReauth = false,
    forToken = false,
): Promise<T> {
    try {
        const odspTokenManager = new OdspTokenManager(odspTokensCache);
        const tokenConfig: OdspTokenConfig = {
            type: "browserLogin",
            navigator: fluidFetchWebNavigator,
        };
        const tokens = await odspTokenManager.getOdspTokens(
            server,
            clientConfig,
            tokenConfig,
            undefined /* forceRefresh */,
            forceTokenReauth || getForceTokenReauth(),
        );

        const result = await callback({
            accessToken: tokens.accessToken,
            refreshTokenFn: getOdspRefreshTokenFn(server, clientConfig, tokens),
        });
        // If this is used for getting a token, then refresh the cache with new token.
        if (forToken) {
            const key: IOdspTokenManagerCacheKey = { isPush: false, userOrServer: server };
            await odspTokenManager.updateTokensCache(
                key, { accessToken: result as any as string, refreshToken: tokens.refreshToken });
            return result;
        }
        return result;
    } catch (e: any) {
        if (e.errorType === DriverErrorType.authorizationError && !forceTokenReauth) {
            // Re-auth
            return resolveWrapper<T>(callback, server, clientConfig, true, forToken);
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
    console.log(fileInfo);
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

export async function getSingleSharePointFile(
    server: string,
    drive: string,
    item: string,
) {
    const clientConfig = getMicrosoftConfiguration();

    return resolveWrapper<IOdspDriveItem>(
        // eslint-disable-next-line @typescript-eslint/promise-function-async
        (authRequestInfo) => getDriveItemFromDriveAndItem(server, drive, item, authRequestInfo),
        server,
        clientConfig,
    );
}

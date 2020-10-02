/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { OdspDriverUrlResolver } from "@fluidframework/odsp-driver";
import {
    createErrorFromResponse,
    getAsync,
    getOdspRefreshTokenFn,
    IClientConfig,
    IOdspAuthRequestInfo,
    IOdspDriveItem,
    IOdspTokens,
    putAsync,
} from "@fluidframework/odsp-utils";

const spoTenants = new Map<string, string>([
    ["spo", "microsoft-my.sharepoint.com"],
    ["spo-df", "microsoft-my.sharepoint-df.com"],
    ["spo-shared", "microsoft.sharepoint.com"],
]);

const pushSrv = "pushchannel.1drv.ms";

export const isSpoPushServer = (server: string) => pushSrv === server ? true : false;

export const getSpoPushServer = () => pushSrv;

export const isSpoTenant = (tenantId: string) => spoTenants.has(tenantId);

export const getSpoServer = (tenantId: string) => spoTenants.get(tenantId);

export function isSpoServer(server: string) {
    for (const item of spoTenants.values()) {
        if (item === server) {
            return true;
        }
    }
    return false;
}

// TODO: These functions are taken from @fluidframework/odsp-utils package and should be removed
// once the public exports of those packages are available on the feeds Gateway consumes
function toIODSPDriveItem(parsedDriveItemBody: any): IOdspDriveItem {
    const path = parsedDriveItemBody.parentReference.path !== undefined ?
        parsedDriveItemBody.parentReference.path.split("root:")[1] : "/";
    return {
        path,
        name: parsedDriveItemBody.name,
        drive: parsedDriveItemBody.parentReference.driveId,
        item: parsedDriveItemBody.id,
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        isFolder: !!parsedDriveItemBody.folder,
    };
}

async function getDriveItem(
    getDriveItemUrl: string,
    authRequestInfo: IOdspAuthRequestInfo,
    create: boolean,
): Promise<IOdspDriveItem> {
    let getDriveItemResult = await getAsync(getDriveItemUrl, authRequestInfo);
    if (getDriveItemResult.status !== 200) {
        if (!create) {
            throw createErrorFromResponse("Unable to get drive/item id from path", getDriveItemResult);
        }

        // Try creating the file
        const contentUri = `${getDriveItemUrl}/content`;
        const createResult = await putAsync(contentUri, authRequestInfo);
        if (createResult.status !== 201) {
            throw createErrorFromResponse("Failed to create file.", createResult);
        }

        getDriveItemResult = await getAsync(getDriveItemUrl, authRequestInfo);
        if (getDriveItemResult.status !== 200) {
            throw createErrorFromResponse("Unable to get drive/item id from path", getDriveItemResult);
        }
    }
    return toIODSPDriveItem(getDriveItemResult.data);
}

async function getDriveItemByRootFileName(
    server: string,
    account: string,
    path: string,
    authRequestInfo: IOdspAuthRequestInfo,
    create: boolean,
    driveId?: string,
): Promise<IOdspDriveItem> {
    const accountPath = account !== undefined ? `/${account}` : "";
    let getDriveItemUrl;
    if (driveId !== undefined && driveId !== "") {
        const encodedDrive = encodeURIComponent(driveId);
        getDriveItemUrl = `https://${server}${accountPath}/_api/v2.1/drives/${encodedDrive}/root:${path}:`;
    } else {
        getDriveItemUrl = `https://${server}${accountPath}/_api/v2.1/drive/root:${path}:`;
    }
    return getDriveItem(getDriveItemUrl, authRequestInfo, create);
}

export async function spoGetResolvedUrl(
    tenantId: string,
    id: string,
    serverTokens: { [server: string]: IOdspTokens } | undefined,
    clientConfig: IClientConfig,
    driveId?: string,
) {
    const server = getSpoServer(tenantId);
    if (server === undefined) {
        return Promise.reject(`Invalid SPO tenantId ${tenantId}`);
    }
    const tokens = serverTokens !== undefined ? serverTokens[server] : undefined;
    if (tokens === undefined) {
        return Promise.reject(`Missing tokens for ${server}`);
    }
    const socketTokens = serverTokens !== undefined ? serverTokens[pushSrv] : undefined;
    if (socketTokens === undefined) {
        return Promise.reject(`Missing tokens for ${pushSrv}`);
    }
    // Only .b items can be fluid
    const encoded = encodeURIComponent(`${id}.fluid`);
    const filePath = tenantId === "spo-shared" ? `/Gateway/${encoded}` : `/r11s/${encoded}`;
    const { drive, item } = await getDriveItemByRootFileName(
        server,
        "",
        filePath,
        {
            accessToken: tokens.accessToken,
            refreshTokenFn: getOdspRefreshTokenFn(server, clientConfig, tokens),
        },
        true,
        driveId,
    );

    const odspUrlResolver = new OdspDriverUrlResolver();
    // TODO: pass path
    const encodedDrive = encodeURIComponent(drive);
    const encodedItem = encodeURIComponent(item);
    const path = "";
    const request = {
        url: `https://${server}/?driveId=${encodedDrive}&itemId=${encodedItem}&path=${encodeURIComponent(path)}`,
    };
    const resolved = await odspUrlResolver.resolve(request) as IFluidResolvedUrl;
    // For now pass the token via the resolved url, so that we can fake the token call back for the driver.
    resolved.tokens.storageToken = tokens.accessToken;
    resolved.tokens.socketToken = socketTokens.accessToken;

    return resolved;
}

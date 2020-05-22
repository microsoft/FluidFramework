/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidResolvedUrl } from "@microsoft/fluid-driver-definitions";
import { OdspDriverUrlResolver } from "@microsoft/fluid-odsp-driver";
import {
    getDriveItemByRootFileName,
    getOdspRefreshTokenFn,
    IClientConfig,
    IOdspTokens,
} from "@microsoft/fluid-odsp-utils";

const spoTenants = new Map<string, string>([
    ["spo", "microsoft-my.sharepoint.com"],
    ["spo-df", "microsoft-my.sharepoint-df.com"],
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

export async function spoGetResolvedUrl(
    tenantId: string,
    id: string,
    serverTokens: { [server: string]: IOdspTokens } | undefined,
    clientConfig: IClientConfig) {
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
    const encoded = encodeURIComponent(`${id}.b`);

    const filePath = `/r11s/${encoded}`;
    const { drive, item } = await getDriveItemByRootFileName(
        server,
        "",
        filePath,
        {
            accessToken: tokens.accessToken,
            refreshTokenFn: getOdspRefreshTokenFn(server, clientConfig, tokens),
        },
        true,
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

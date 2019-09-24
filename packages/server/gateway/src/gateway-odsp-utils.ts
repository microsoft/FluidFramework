/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { OdspUrlResolver } from "@microsoft/fluid-odsp-driver";
import { getDriveItemByFileName, IClientConfig, IODSPTokens } from "@microsoft/fluid-odsp-utils";
import { IFluidResolvedUrl } from "@microsoft/fluid-protocol-definitions";
import { URL } from "url";

const spoTenants = new Map<string, string>([
    ["spo", "microsoft-my.sharepoint.com"],
    ["spo-df", "microsoft-my.sharepoint-df.com"],
]);

const pushSrv = "pushchannel.1drv.ms";

export function isSpoTenant(tenantId: string) {
    return spoTenants.has(tenantId);
}

function isSpoServer(server: string) {
    for (const item of spoTenants.values()) {
        if (item === server) {
            return true;
        }
    }
    return false;
}

function getSpoServer(tenantId: string) {
    return spoTenants.get(tenantId);
}

export function saveSpoTokens(req, params, accessToken: string, refreshToken: string) {
    if (!req.session.tokens) {
        req.session.tokens = {};
    }
    try {
        const url = new URL(params.scope);
        if (url.protocol === "https:" && (isSpoServer(url.hostname) || url.hostname === pushSrv)) {
            req.session.tokens[url.hostname] = { accessToken, refreshToken };
        }
    } catch (e) {
        // Nothing
        console.error(e);
    }
}

export function spoEnsureLoggedIn() {
    return (req, res, next) => {
        const tenantId = req.params.tenantId;
        if (isSpoTenant(tenantId)) {
            if (!req.session
                || !req.session.tokens
                || !req.session.tokens[getSpoServer(tenantId)]
                || !req.session.tokens[getSpoServer(tenantId)].accessToken) {

                req.session.returnTo = req.originalUrl || req.url;
                return res.redirect(`/login_${req.params.tenantId}`);
            }

            if (!req.session.tokens[pushSrv]) {
                req.session.returnTo = req.originalUrl || req.url;
                return res.redirect(`/login_pushsrv`);
            }
        }
        next();
    };
}

export async function spoGetResolvedUrl(
    tenantId: string,
    id: string,
    serverTokens: { [server: string]: IODSPTokens } | undefined,
    clientConfig: IClientConfig) {

    const server = getSpoServer(tenantId);
    if (server === undefined) {
        return Promise.reject(`Invalid SPO tenantId ${tenantId}`);
    }
    const tokens = serverTokens ? serverTokens[server] : undefined;
    if (tokens === undefined) {
        return Promise.reject(`Missing tokens for ${server}`);
    }
    const socketTokens = serverTokens ? serverTokens[pushSrv] : undefined;
    if (socketTokens === undefined) {
        return Promise.reject(`Missing tokens for ${pushSrv}`);
    }
    // Only .b items can be fluid
    const encoded = encodeURIComponent(`${id}.b`);

    const filePath = `/r11s/${encoded}`;
    const { drive, item } = await getDriveItemByFileName(server, "", filePath, clientConfig, tokens, true);
    const odspUrlResolver = new OdspUrlResolver();
    // TODO: pass path
    const path = "";
    const request = { url: `https://${server}/?driveId=${encodeURIComponent(drive)}&itemId=${encodeURIComponent(item)}&path=${encodeURIComponent(path)}` };
    const resolved = await odspUrlResolver.resolve(request) as IFluidResolvedUrl;
    // For now pass the token via the resolved url, so that we can fake the token call back for the driver.
    resolved.tokens.storageToken = tokens.accessToken;
    resolved.tokens.socketToken = socketTokens.accessToken;

    return resolved;
}

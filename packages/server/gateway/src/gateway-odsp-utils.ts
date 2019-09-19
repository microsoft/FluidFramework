/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getODSPFluidResolvedUrl, IClientConfig, IODSPTokens } from "@microsoft/fluid-odsp-utils";
import { IFluidResolvedUrl } from "@microsoft/fluid-protocol-definitions";
import { URL } from "url";

const spoTenants = new Map<string, string>([
    ["spo", "microsoft-my.sharepoint.com"],
    ["spo-df", "microsoft-my.sharepoint-df.com"],
]);

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
        if (url.protocol === "https:" && isSpoServer(url.hostname)) {
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
                || !req.session.tokens[getSpoServer(tenantId)]) {

                req.session.returnTo = req.originalUrl || req.url;
                return res.redirect(`/login_${req.params.tenantId}`);
            }
        }
        next();
    };
}

export async function spoJoinSession(
    tenantId: string,
    id: string,
    serverTokens: { [server: string]: IODSPTokens } | undefined,
    clientConfig: IClientConfig): Promise<IFluidResolvedUrl> {

    const server = getSpoServer(tenantId);
    if (server === undefined) {
        return Promise.reject(`Invalid SPO tenantId ${tenantId}`);
    }
    const tokens = serverTokens ? serverTokens[server] : undefined;
    if (tokens === undefined) {
        return Promise.reject(`Missing tokens for ${server}`);
    }
    // Only .b items can be fluid
    const encoded = encodeURIComponent(`${id}.b`);
    return getODSPFluidResolvedUrl(server, `drive/root:/r11s/${encoded}:`, tokens, clientConfig, true);
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidResolvedUrl } from "@prague/container-definitions";
import { getODSPFluidResolvedUrl, IClientConfig, IODSPTokens } from "@prague/odsp-utils";

const spoTenants = new Map<string, string>([
    ["spo", "microsoft-my.sharepoint.com"],
    ["spo-df", "microsoft-my.sharepoint-df.com"],
]);

export function isSpoTenant(tenantId: string) {
    return spoTenants.has(tenantId);
}

export function getSpoServer(tenantId: string) {
    return spoTenants.get(tenantId);
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
    // Only .b items can be prague
    const encoded = encodeURIComponent(`${id}.b`);

    // tslint:disable-next-line: no-unsafe-any
    return getODSPFluidResolvedUrl(server, `drive/root:/r11s/${encoded}:`, tokens, clientConfig, true);
}

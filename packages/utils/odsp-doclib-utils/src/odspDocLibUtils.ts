/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const odspTenants = new Map<string, string>([
    ["spo", "microsoft-my.sharepoint.com"],
    ["spo-df", "microsoft-my.sharepoint-df.com"],
]);

export function isSharepointURL(server: string) {
    return server.endsWith("sharepoint.com") || server.endsWith("sharepoint-df.com");
}

export function getSharepointTenant(server: string) {
    let tenantName = server.substr(0, server.indexOf(".")).toLowerCase();
    const restOfServerName = server.substr(tenantName.length).toLowerCase();
    if (tenantName.endsWith("-my")) {
        tenantName = tenantName.substr(0, tenantName.length - 3);
    }
    return tenantName === "microsoft" ? "organizations" : `${tenantName}${restOfServerName}`;
}

export function getServer(tenantId: string): string {
    const server = odspTenants.get(tenantId);
    if (!server) {
        throw Error(`Invalid SPO tenantId ${tenantId}.`);
    }
    return server;
}

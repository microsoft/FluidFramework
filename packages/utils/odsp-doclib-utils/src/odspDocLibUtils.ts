/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const odspTenants = new Map<string, string>([
    ["spo", "microsoft-my.sharepoint.com"],
    ["spo-df", "microsoft-my.sharepoint-df.com"],
]);

export function isOdspHostname(hostname: string) {
    return hostname.endsWith("sharepoint.com") || hostname.endsWith("sharepoint-df.com");
}

export function getAadTenant(hostname: string) {
    let tenantName = hostname.substr(0, hostname.indexOf(".")).toLowerCase();
    let restOfTenantHostname = hostname.substr(tenantName.length).toLowerCase();

    if (tenantName.endsWith("-my")) {
        tenantName = tenantName.substr(0, tenantName.length - 3);
    } else if (tenantName.endsWith("-admin")) {
        tenantName = tenantName.substr(0, tenantName.length - 6);
    }

    if (restOfTenantHostname.indexOf(".sharepoint.") === 0) {
        restOfTenantHostname = `.onmicrosoft.${restOfTenantHostname.substr(12)}`;
    } if (restOfTenantHostname.indexOf(".sharepoint-df.") === 0) {
        restOfTenantHostname = `.onmicrosoft.${restOfTenantHostname.substr(15)}`;
    }

    return `${tenantName}${restOfTenantHostname}`;
}

export function getServer(tenantId: string): string {
    const server = odspTenants.get(tenantId);
    if (!server) {
        throw Error(`Invalid SPO tenantId ${tenantId}.`);
    }
    return server;
}

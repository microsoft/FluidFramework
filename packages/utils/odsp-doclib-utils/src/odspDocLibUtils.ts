/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const odspTenants = new Map<string, string>([
    ["spo", "microsoft-my.sharepoint.com"],
    ["spo-df", "microsoft-my.sharepoint-df.com"],
]);

export function isOdspHostname(server: string) {
    return server.endsWith("sharepoint.com") || server.endsWith("sharepoint-df.com");
}

export function isPushChannelHostname(server: string) {
    return server.includes(".push") && server.endsWith(".svc.ms");
}

export function getAadUrl(server: string) {
    // special case for local / pushchannel testing
    if (server === "localhost" || server.startsWith("localhost:")) {
        // localhost will not be https
        return `http://${server}`;
    }

    if (isPushChannelHostname(server)) {
        // if the SPO url is pushchannel, use the pushchannel AAD mock
        return getSiteUrl(server);
    }

    return `https://login.microsoftonline.com`;
}

export function getAadTenant(server: string) {
    let hostname = server;

    if (hostname.startsWith("http://")) {
        hostname = hostname.substring(7);
    } else if (hostname.startsWith("https://")) {
        hostname = hostname.substring(8);
    }

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

export function getSiteUrl(server: string) {
    if (server.startsWith("http://") || server.startsWith("https://")) {
        // server is already a site url
        return server;
    }

    // server is likely {tenantId}.sharepoint.com. add https to make it the site url
    return `https://${server}`;
}

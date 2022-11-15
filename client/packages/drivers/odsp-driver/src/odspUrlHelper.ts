/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IOdspUrlParts } from "@fluidframework/odsp-driver-definitions";

// Centralized store for all ODC/SPO logic

/**
 * Checks whether or not the given URL origin is an ODC origin
 * @param origin - The URL origin to check
 */
export function isOdcOrigin(origin: string): boolean {
    return (
        // Primary API endpoint and several test endpoints
        origin.includes("onedrive.com") ||
        // *storage.live.com hostnames
        origin.includes("storage.live.com") ||
        // live-int
        origin.includes("storage.live-int.com") ||
        // Test endpoints
        origin.includes("onedrive-tst.com")
    );
}

/**
 * Gets the correct API root for the given ODSP url, e.g. 'https://foo-my.sharepoint.com/_api/v2.1'
 * @param origin - The URL origin
 */
export function getApiRoot(origin: string): string {
    let prefix = "_api/";
    if (isOdcOrigin(origin)) {
        prefix = "";
    }

    return `${origin}/${prefix}v2.1`;
}

/**
 * Whether or not the given URL is a valid SPO/ODB URL
 * @param url - The URL to check
 */
export function isSpoUrl(url: string): boolean {
    const urlLower = url.toLowerCase();

    // Format: foo.sharepoint.com/_api/v2.1./drives/bar/items/baz and foo.sharepoint-df.com/...
    const spoRegex = /(.*\.sharepoint(-df)*\.com)\/_api\/v2.1\/drives\/([^/]*)\/items\/([^/]*)/;
    return !!spoRegex.exec(urlLower);
}

/**
 * Whether or not the given URL is a valid ODC URL
 * @param url - The URL to check
 */
export function isOdcUrl(url: string | URL): boolean {
    const urlObj = typeof url === "string" ? new URL(url) : url;

    if (!isOdcOrigin(urlObj.origin)) {
        return false;
    }

    const path = urlObj.pathname.toLowerCase();

    // Splitting the regexes so we don't have regex soup
    // Format: /v2.1/drive/items/ABC123!123 and /v2.1/drives/ABC123/items/ABC123!123
    const odcRegex = /\/v2.1\/(drive|drives\/[^/]+)\/items\/([\da-z]+)!(\d+)/;

    // Format: /v2.1/drives('ABC123')/items('ABC123!123')
    const odcODataRegex = /\/v2.1\/drives\('[^/]+'\)\/items\('[\da-z]+!\d+'\)/;

    return !!(odcRegex.exec(path) ?? odcODataRegex.exec(path));
}

/**
 * Breaks an ODSP URL into its parts, extracting the site, drive ID, and item ID.
 * Returns undefined for invalid/malformed URLs.
 * @param url - The (raw) URL to parse
 */
export async function getOdspUrlParts(url: URL): Promise<IOdspUrlParts | undefined> {
    const pathname = url.pathname;

    // Joinsession like URL
    // Pick a regex based on the hostname
    // TODO This will only support ODC using api.onedrive.com, update to handle the future (share links etc)
    let joinSessionMatch;
    if (isOdcOrigin(url.origin)) {
        // Capture groups:
        // 0: match
        // 1: origin
        // 2: optional `drives` capture (the `/drives/<DRIVEID>` API format vs `/drive`)
        // 3: optional captured drive ID
        // 4: Item ID
        // 5: Drive ID portion of Item ID
        // eslint-disable-next-line unicorn/no-unsafe-regex
        joinSessionMatch = /(.*)\/v2\.1\/drive(s\/([\dA-Za-z]+))?\/items\/(([\dA-Za-z]+)!\d+)/.exec(pathname);

        if (joinSessionMatch === null) {
            // Try again but with the OData format ( `/drives('ABC123')/items('ABC123!456')` )
            joinSessionMatch = /(.*)\/v2\.1\/drives\('([\dA-Za-z]+)'\)\/items\('(([\dA-Za-z]+)!\d+)'\)/.exec(pathname);

            if (joinSessionMatch === null) {
                return undefined;
            }
        }

        const driveId = joinSessionMatch[3] || joinSessionMatch[5];
        const itemId = joinSessionMatch[4];

        return { siteUrl: `${url.origin}${url.pathname}`, driveId, itemId };
    } else {
        joinSessionMatch = /(.*)\/_api\/v2.1\/drives\/([^/]*)\/items\/([^/]*)(.*)/.exec(pathname);

        if (joinSessionMatch === null) {
            return undefined;
        }
        const driveId = joinSessionMatch[2];
        const itemId = joinSessionMatch[3];

        return { siteUrl: `${url.origin}${url.pathname}`, driveId, itemId };
    }
}

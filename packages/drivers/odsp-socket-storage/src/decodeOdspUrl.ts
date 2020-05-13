/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export function decodeOdspUrl(url: string): { siteUrl: string; driveId: string; itemId: string; path: string } {
    const [siteUrl, queryString] = url.split("?");

    const searchParams = new URLSearchParams(queryString);

    const driveId = searchParams.get("driveId");
    const itemId = searchParams.get("itemId");
    const path = searchParams.get("path");

    if (driveId === null) {
        throw new Error("ODSP URL did not contain a drive id");
    }

    if (itemId === null) {
        throw new Error("ODSP Url did not contain an item id");
    }

    if (path === null) {
        throw new Error("ODSP Url did not contain a path");
    }

    return {
        siteUrl,
        driveId: decodeURIComponent(driveId),
        itemId: decodeURIComponent(itemId),
        path: decodeURIComponent(path),
    };
}

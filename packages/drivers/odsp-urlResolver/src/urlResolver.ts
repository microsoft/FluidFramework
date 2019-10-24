/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IRequest,
} from "@microsoft/fluid-component-core-interfaces";
import { IOdspResolvedUrl } from "@microsoft/fluid-odsp-driver";
import {
    IResolvedUrl,
    IUrlResolver,
} from "@microsoft/fluid-protocol-definitions";
import * as sha from "sha.js";

export class OdspUrlResolver implements IUrlResolver {

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        if (isOdspUrl(request.url)) {
            const reqUrl = new URL(request.url);
            const { site, drive, item } = await initializeODSP(reqUrl);
            if (site === undefined || drive === undefined || item === undefined) {
                return Promise.reject("Cannot resolve the given url!!");
            }
            const hashedDocumentId = new sha.sha256().update(`${site}_${drive}_${item}`).digest("hex");

            let documentUrl = `fluid-odsp://placeholder/placeholder/${hashedDocumentId}`;

            if (request.url.length > 0) {
                // In case of any additional parameters add them back to the url
                const requestURL = new URL(request.url);
                const searchParams = requestURL.search;
                if (!!searchParams) {
                    documentUrl += searchParams;
                }
            }
            const response: IOdspResolvedUrl = {
                endpoints: { snapshotStorageUrl: getSnapshotUrl(site, drive, item) },
                tokens: {},
                type: "fluid",
                url: documentUrl,
                hashedDocumentId,
                siteUrl: site,
                driveId: drive,
                itemId: item,
            };

            return response;
        }
        return Promise.reject("Cannot resolve the given url!!");
    }
}

export function isOdspUrl(url: string) {
    const regex = /(.*\.sharepoint(-df)*\.com)\/_api\/v2.1\/drives\/([^\/]*)\/items\/([^\/]*)/;
    if (url.toLowerCase().match(regex) !== null) {
        return true;
    }
    return false;
}

function getSnapshotUrl(server: string, drive: string, item: string) {
    const siteOrigin = new URL(server).origin;
    return `${siteOrigin}/_api/v2.1/drives/${drive}/items/${item}/opStream/snapshots`;
}

async function initializeODSP(url: URL): Promise<{site: string, drive: string, item: string}> {

    const pathname = url.pathname;

    // Joinsession like URL
    const joinSessionMatch = pathname.match(
        /(.*)\/_api\/v2.1\/drives\/([^\/]*)\/items\/([^\/]*)(.*)/);

    if (joinSessionMatch === null) {
        return Promise.reject("Unable to parse ODSP URL path");
    }
    const drive = joinSessionMatch[2];
    const item = joinSessionMatch[3];

    return { site: url.href, drive, item };
}

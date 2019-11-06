/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IRequest,
} from "@microsoft/fluid-component-core-interfaces";
import { createOdspUrl, OdspDriverUrlResolver } from "@microsoft/fluid-odsp-driver";
import {
    IResolvedUrl,
    IUrlResolver,
} from "@microsoft/fluid-protocol-definitions";

export class OdspUrlResolver implements IUrlResolver {

    public async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
        if (isOdspUrl(request.url)) {
            const reqUrl = new URL(request.url);
            const contents = await initializeODSP(reqUrl);
            if (!contents) {
                return undefined;
            }
            const site = contents.site;
            const drive = contents.drive;
            const item = contents.item;
            const urlToBeResolved = createOdspUrl(site, drive, item, "/");
            const odspDriverUrlResolver: IUrlResolver = new OdspDriverUrlResolver();
            return odspDriverUrlResolver.resolve({ url: urlToBeResolved });
        }
        return undefined;
    }
}

export function isOdspUrl(url: string) {
    const regex = /(.*\.sharepoint(-df)*\.com)\/_api\/v2.1\/drives\/([^\/]*)\/items\/([^\/]*)/;
    if (url.toLowerCase().match(regex) !== null) {
        return true;
    }
    return false;
}

async function initializeODSP(url: URL) {

    const pathname = url.pathname;

    // Joinsession like URL
    const joinSessionMatch = pathname.match(
        /(.*)\/_api\/v2.1\/drives\/([^\/]*)\/items\/([^\/]*)(.*)/);

    if (joinSessionMatch === null) {
        return undefined;
    }
    const drive = joinSessionMatch[2];
    const item = joinSessionMatch[3];

    return { site: `${url.origin}${url.pathname}`, drive, item };
}

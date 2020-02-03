/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IResolvedUrl, IUrlResolver } from "@microsoft/fluid-driver-definitions";
import { createOdspUrl, OdspDriverUrlResolver } from "@microsoft/fluid-odsp-driver";

export class OdspUrlResolver implements IUrlResolver {

    public async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
        if (isOdspUrl(request.url)) {
            const reqUrl = new URL(request.url);
            const contents = await initializeODSP(reqUrl);
            if (!contents) {
                return undefined;
            }
            const urlToBeResolved = createOdspUrl(contents.site, contents.drive, contents.item, "");
            const odspDriverUrlResolver: IUrlResolver = new OdspDriverUrlResolver();
            return odspDriverUrlResolver.resolve({ url: urlToBeResolved });
        }
        return undefined;
    }
}

export function isOdspUrl(url: string) {
    url = url.toLowerCase();

    // Splitting the regexes so we don't have regex soup 
    const odcRegex = /(.*\.onedrive\.com)\/v1.0\/(drive|drives\/[^/]+)\/items\/([a-z0-9]+)!([0-9]+)/;
    const spoRegex = /(.*\.sharepoint(-df)*\.com)\/_api\/v2.1\/drives\/([^/]*)\/items\/([^/]*)/;
    
    if (spoRegex.exec(url) || odcRegex.exec(url)) {
        return true;
    }
    return false;
}

async function initializeODSP(url: URL) {

    const pathname = url.pathname;

    // Joinsession like URL
    // Pick a regex based on the hostname
    // TODO This will only support ODC using api.onedrive.com, update to handle the future (share links etc)
    let joinSessionMatch;
    if (url.host.toLowerCase().indexOf('.onedrive.com') !== -1) {
        // Capture groups:
        // 0: match
        // 1: origin
        // 2: optional `drives` capture (the `/drives/<DRIVEID>` API format vs `/drive`)
        // 3: optional captured drive ID
        // 4: Item ID
        // 5: Drive ID portion of Item ID
        joinSessionMatch = /(.*)\/v1.0\/drive(s\/([A-Za-z0-9]+))?\/items\/(([A-Za-z0-9]+)![0-9]+)/.exec(pathname);

        // eslint-disable-next-line no-null/no-null
        if (joinSessionMatch === null) {
            return undefined;
        }

        const drive = joinSessionMatch[3] || joinSessionMatch[5];
        const item = joinSessionMatch[4];
    
        return { site: `${url.origin}${url.pathname}`, drive, item };
    } else {
        joinSessionMatch = /(.*)\/_api\/v2.1\/drives\/([^/]*)\/items\/([^/]*)(.*)/.exec(pathname);

        // eslint-disable-next-line no-null/no-null
        if (joinSessionMatch === null) {
            return undefined;
        }
        const drive = joinSessionMatch[2];
        const item = joinSessionMatch[3];
    
        return { site: `${url.origin}${url.pathname}`, drive, item };
    }
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IRequest,
} from "@microsoft/fluid-component-core-interfaces";
import { fromBase64ToUtf8 } from "@microsoft/fluid-core-utils";
import { createOdspUrl, OdspDriverUrlResolver } from "@microsoft/fluid-odsp-driver";
import {
    IResolvedUrl,
    IUrlResolver,
} from "@microsoft/fluid-protocol-definitions";

const fluidOfficeServers = [
    "dev.fluidpreview.office.net",
    "fluidpreview.office.net",
];

export class FluidAppOdspUrlResolver implements IUrlResolver {

    public async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
        const reqUrl = new URL(request.url);
        const server = reqUrl.hostname.toLowerCase();
        if (fluidOfficeServers.indexOf(server) !== -1) {
            const contents = await initializeFluidOffice(reqUrl);
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

async function initializeFluidOffice(urlSource: URL) {
    const pathname = urlSource.pathname;
    const siteDriveItemMatch = pathname.match(/\/p\/([^\/]*)\/([^\/]*)\/([^\/]*)/);

    if (siteDriveItemMatch === null) {
        return undefined;
    }

    const site = decodeURIComponent(siteDriveItemMatch[1]);

    // Path value is base64 encoded so need to decode first
    const decodedSite = fromBase64ToUtf8(site);

    // Site value includes storage type
    const storageType = decodedSite.split(":")[0];
    const expectedStorageType = "spo";  // Only support spo for now
    if (storageType !== expectedStorageType) {
        return Promise.reject(`Unexpected storage type ${storageType}, expected: ${expectedStorageType}`);
    }

    // Since we have the drive and item, only take the host ignore the rest
    const siteUrl = decodedSite.substring(storageType.length + 1);
    const drive = decodeURIComponent(siteDriveItemMatch[2]);
    const item = decodeURIComponent(siteDriveItemMatch[3]);
    return { site: siteUrl, drive, item };
}

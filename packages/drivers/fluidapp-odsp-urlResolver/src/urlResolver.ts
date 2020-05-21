/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { fromBase64ToUtf8 } from "@fluidframework/common-utils";
import { IResolvedUrl, IUrlResolver } from "@microsoft/fluid-driver-definitions";
import { createOdspUrl, OdspDriverUrlResolver } from "@microsoft/fluid-odsp-driver";

const fluidOfficeServers = [
    "dev.fluidpreview.office.net",
    "fluidpreview.office.net",
];

export class FluidAppOdspUrlResolver implements IUrlResolver {
    public async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
        const reqUrl = new URL(request.url);
        const server = reqUrl.hostname.toLowerCase();
        if (fluidOfficeServers.includes(server)) {
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            const contents = await initializeFluidOffice(reqUrl);
            if (!contents) {
                return undefined;
            }
            const urlToBeResolved = createOdspUrl(contents.site, contents.drive, contents.item, "");
            const odspDriverUrlResolver: IUrlResolver = new OdspDriverUrlResolver();
            return odspDriverUrlResolver.resolve({ url: urlToBeResolved });
        }
        return undefined;
    }

    // TODO: Issue-2109 Implement detach container api or put appropriate comment.
    public async getAbsoluteUrl(
        resolvedUrl: IResolvedUrl,
        relativeUrl: string,
    ): Promise<string> {
        throw new Error("Not implmented");
    }
}

async function initializeFluidOffice(urlSource: URL) {
    const pathname = urlSource.pathname;
    // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
    const siteDriveItemMatch = pathname.match(/\/p\/([^/]*)\/([^/]*)\/([^/]*)/);

    // eslint-disable-next-line no-null/no-null
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

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert , fromBase64ToUtf8 } from "@fluidframework/common-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import { IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";
import { createOdspUrl, OdspDriverUrlResolver } from "@fluidframework/odsp-driver";

const fluidOfficeServers = [
    "dev.fluidpreview.office.net",
    "fluidpreview.office.net",
];

export class FluidAppOdspUrlResolver implements IUrlResolver {
    public async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
        const reqUrl = new URL(request.url);
        const server = reqUrl.hostname.toLowerCase();
        let contents: { drive: string; item: string; site: string } | undefined;
        if (fluidOfficeServers.includes(server)) {
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            contents = await initializeFluidOffice(reqUrl);
        } else if (server === "www.office.com") {
            const getRequiredParam = (name: string): string => {
                const value = reqUrl.searchParams.get(name);
                assert(!!value, `Missing ${name} from office.com URL parameter`);
                return value;
            };
            contents = {
                drive: getRequiredParam("drive"),
                item: getRequiredParam("item"),
                site: getRequiredParam("siteUrl"),
            };
        } else {
            return undefined;
        }
        if (!contents) {
            return undefined;
        }
        const urlToBeResolved = createOdspUrl(contents.site, contents.drive, contents.item, "");
        const odspDriverUrlResolver: IUrlResolver = new OdspDriverUrlResolver();
        return odspDriverUrlResolver.resolve({ url: urlToBeResolved });
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
        return Promise.reject(new Error(`Unexpected storage type ${storageType}, expected: ${expectedStorageType}`));
    }

    // Since we have the drive and item, only take the host ignore the rest
    const siteUrl = decodedSite.substring(storageType.length + 1);
    const drive = decodeURIComponent(siteDriveItemMatch[2]);
    const item = decodeURIComponent(siteDriveItemMatch[3]);
    return { site: siteUrl, drive, item };
}

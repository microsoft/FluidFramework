/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fromBase64ToUtf8 } from "@fluidframework/common-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import { IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";
import { createOdspUrl, OdspDriverUrlResolver } from "@fluidframework/odsp-driver";
import { IOdspUrlParts } from "@fluidframework/odsp-driver-definitions";

const fluidOfficeAndOneNoteServers = [
    "dev.fluidpreview.office.net",
    "fluidpreview.office.net",
    "www.onenote.com",
];

export class FluidAppOdspUrlResolver implements IUrlResolver {
    public async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
        const reqUrl = new URL(request.url);
        const server = reqUrl.hostname.toLowerCase();
        let contents: IOdspUrlParts | undefined;
        if (fluidOfficeAndOneNoteServers.includes(server)) {
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            contents = await initializeFluidOfficeOrOneNote(reqUrl);
        } else if (server === "www.office.com") {
            const getRequiredParam = (name: string): string => {
                const value = reqUrl.searchParams.get(name);
                assert(!!value, 0x097 /* `Missing ${name} from office.com URL parameter` */);
                return value;
            };
            contents = {
                driveId: getRequiredParam("drive"),
                itemId: getRequiredParam("item"),
                siteUrl: getRequiredParam("siteUrl"),
            };
        } else {
            return undefined;
        }
        if (!contents) {
            return undefined;
        }
        const urlToBeResolved = createOdspUrl({ ...contents, dataStorePath: "" });
        const odspDriverUrlResolver: IUrlResolver = new OdspDriverUrlResolver();
        return odspDriverUrlResolver.resolve({ url: urlToBeResolved });
    }

    // TODO: Issue-2109 Implement detach container api or put appropriate comment.
    public async getAbsoluteUrl(
        resolvedUrl: IResolvedUrl,
        relativeUrl: string,
    ): Promise<string> {
        throw new Error("Not implemented");
    }
}

async function initializeFluidOfficeOrOneNote(urlSource: URL): Promise<IOdspUrlParts | undefined> {
    const pathname = urlSource.pathname;
    // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
    const siteDriveItemMatch = pathname.match(/\/(p|preview|meetingnotes|notes)\/([^/]*)\/([^/]*)\/([^/]*)/);
    if (siteDriveItemMatch === null) {
        return undefined;
    }

    const site = decodeURIComponent(siteDriveItemMatch[2]);

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
    const driveId = decodeURIComponent(siteDriveItemMatch[3]);
    const itemId = decodeURIComponent(siteDriveItemMatch[4]);
    return { siteUrl, driveId, itemId };
}

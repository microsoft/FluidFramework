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

const officeServers = [
    "weuprodprv.www.office.com",
    "ncuprodprv.www.office.com",
];

export class OfficeOdspUrlResolver implements IUrlResolver {

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const reqUrl = new URL(request.url);
        const server = reqUrl.hostname.toLowerCase();
        if (officeServers.indexOf(server) !== -1) {
            const { site, drive, item } = initializeOfficeODSP(reqUrl.searchParams);
            if (site === undefined || drive === undefined || item === undefined) {
                return Promise.reject("Cannot resolve the givem url!!");
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
        return Promise.reject("Cannot resolve the givem url!!");
    }
}

function initializeOfficeODSP(searchParams: URLSearchParams) {
    const site = searchParams.get("site");
    const drive = searchParams.get("drive");
    const item = searchParams.get("item");
    if (site === null || drive === null || item === null) {
        return {};
    }
    return { site, drive, item };
}

function getSnapshotUrl(server: string, drive: string, item: string) {
    const siteOrigin = new URL(server).origin;
    return `${siteOrigin}/_api/v2.1/drives/${drive}/items/${item}/opStream/snapshots`;
}

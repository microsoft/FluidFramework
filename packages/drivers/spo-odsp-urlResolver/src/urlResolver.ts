/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IRequest,
} from "@microsoft/fluid-component-core-interfaces";
import { IOdspResolvedUrl } from "@microsoft/fluid-odsp-driver";
import { getDriveItemByFileId, IClientConfig, IODSPDriveItem, IODSPTokens } from "@microsoft/fluid-odsp-utils";
import {
    IResolvedUrl,
    IUrlResolver,
} from "@microsoft/fluid-protocol-definitions";
import * as sha from "sha.js";

const odspServers = [
    "microsoft-my.sharepoint-df.com",
    "microsoft-my.sharepoint.com",
    "microsoft.sharepoint-df.com",
    "microsoft.sharepoint.com",
];

export class OdspUrlResolver implements IUrlResolver {

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const reqUrl = new URL(request.url);
        const server = reqUrl.hostname.toLowerCase();
        if (odspServers.indexOf(server) !== -1) {
            const { site, drive, item } = await initializeSpoODSP(server, reqUrl, request.headers);
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

function getSnapshotUrl(server: string, drive: string, item: string) {
    const siteOrigin = new URL(server).origin;
    return `${siteOrigin}/_api/v2.1/drives/${drive}/items/${item}/opStream/snapshots`;
}

async function initializeSpoODSP(
    server: string,
    url: URL,
    headers: any): Promise<{site: string, drive: string, item: string}> {

    const pathname = url.pathname;
    const searchParams = url.searchParams;

    // Sharepoint hosted URL
    const sourceDoc = searchParams.get("sourcedoc");
    if (sourceDoc) {
        const hostedMatch = pathname.match(/\/(personal|teams)\/([^\/]*)\//i);
        if (hostedMatch !== null) {
            const odspTokens: IODSPTokens = headers && headers.odspTokens ? headers.odspTokens : undefined;
            const clientConfig: IClientConfig = headers && headers.clientConfig ? headers.clientConfig : undefined;
            if (!odspTokens || !clientConfig) {
                return Promise.reject("Missing odsp tokesn and client credentials!!");
            }
            const a = await initializeODSPHosted(url,
                server,
                `${hostedMatch[1]}/${hostedMatch[2]}`,
                sourceDoc,
                odspTokens,
                clientConfig);
            return a;
        }
    }

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

async function initializeODSPHosted(
    url: URL,
    server: string,
    account: string,
    docId: string,
    odspTokens: IODSPTokens,
    clientConfig: IClientConfig) {
    const driveItem = await resolveDriveItemByFileId(server, account, docId, clientConfig, odspTokens);
    return { site: url.href, drive: driveItem.drive, item: driveItem.item };
}

async function resolveDriveItemByFileId(
    server: string,
    account: string,
    docId: string,
    clientConfig: IClientConfig,
    odspTokens: IODSPTokens,
    forceTokenRefresh = false): Promise<IODSPDriveItem> {

    try {
        const driveItem: IODSPDriveItem = await getDriveItemByFileId(server, account, docId, clientConfig, odspTokens);
        return driveItem;
    } catch (e) {
        const parsedBody = JSON.parse(e.requestResult.data);
        if (parsedBody.error === "invalid_grant" && parsedBody.suberror === "consent_required" && !forceTokenRefresh) {
            return resolveDriveItemByFileId(server, account, docId, clientConfig, odspTokens, true);
        }
        const responseMsg = JSON.stringify(parsedBody.error, undefined, 2);
        return Promise.reject(`Fail to connect to ODSP server\nError Response:\n${responseMsg}`);
    }
}

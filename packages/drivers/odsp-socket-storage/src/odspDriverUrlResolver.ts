/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import {
    IUrlResolver,
    IExperimentalUrlResolver,
    IResolvedUrl,
    OpenMode,
} from "@microsoft/fluid-driver-definitions";
import { IOdspResolvedUrl, ICreateNewOptions } from "./contracts";
import { getHashedDocumentId } from "./odspUtils";
import { getApiRoot } from "./odspUrlHelper";

function getSnapshotUrl(siteUrl: string, driveId: string, itemId: string) {
    const siteOrigin = new URL(siteUrl).origin;
    return `${getApiRoot(siteOrigin)}/drives/${driveId}/items/${itemId}/opStream/snapshots`;
}

/**
 * Utility that enables us to handle paths provided with a beginning slash.
 * For example if a value of '/id1/id2' is provided, id1/id2 is returned.
 */
function removeBeginningSlash(str: string): string {
    if (str.startsWith("/")) {
        return str.substr(1);
    }

    return str;
}

export class OdspDriverUrlResolver implements IUrlResolver, IExperimentalUrlResolver {
    public readonly isExperimentalUrlResolver = true;
    constructor() { }

    public async resolve(request: IRequest): Promise<IOdspResolvedUrl> {
        if (request.headers) {
            if (request.headers.newFileInfoPromise) {
                const createNewOptions: ICreateNewOptions = {
                    newFileInfoPromise: request.headers.newFileInfoPromise,
                };
                const [, queryString] = request.url.split("?");

                const searchParams = new URLSearchParams(queryString);

                const uniqueId = searchParams.get("uniqueId");
                if (uniqueId === null) {
                    throw new Error("ODSP URL for new file should contain the uniqueId");
                }
                return {
                    type: "fluid",
                    endpoints: {
                        snapshotStorageUrl: "",
                    },
                    createNewOptions,
                    tokens: {},
                    url: `fluid-odsp://placeholder/placeholder/${uniqueId}?version=null`,
                    hashedDocumentId: "",
                    siteUrl: "",
                    driveId: "",
                    itemId: "",
                    fileName: "",
                };
            } else if (request.headers.openMode === OpenMode.CreateNew) {
                const [siteURL, queryString] = request.url.split("?");

                const searchParams = new URLSearchParams(queryString);
                const fileName = request.headers.fileName;
                const driveID = searchParams.get("driveId");
                const filePath = searchParams.get("path");
                if (!(fileName && siteURL && driveID && filePath)) {
                    throw new Error("Proper new file params should be there!!");
                }
                return {
                    endpoints: {
                        snapshotStorageUrl: "",
                    },
                    tokens: {},
                    type: "fluid",
                    url: `fluid-odsp://${siteURL}?${queryString}&version=null`,
                    siteUrl: siteURL,
                    hashedDocumentId: "",
                    driveId: driveID,
                    itemId: "",
                    fileName,
                };
            }
        }
        const { siteUrl, driveId, itemId, path } = this.decodeOdspUrl(request.url);
        const hashedDocumentId = getHashedDocumentId(driveId, itemId);
        assert.ok(!hashedDocumentId.includes("/"), "Docid should not contain slashes!!");

        let documentUrl = `fluid-odsp://placeholder/placeholder/${hashedDocumentId}/${removeBeginningSlash(path)}`;

        if (request.url.length > 0) {
            // In case of any additional parameters add them back to the url
            const requestURL = new URL(request.url);
            const searchParams = requestURL.search;
            if (searchParams) {
                documentUrl += searchParams;
            }
        }
        return {
            type: "fluid",
            endpoints: {
                snapshotStorageUrl: getSnapshotUrl(siteUrl, driveId, itemId),
            },
            tokens: {},
            url: documentUrl,
            hashedDocumentId,
            siteUrl,
            driveId,
            itemId,
            fileName: "",
        };
    }

    public async requestUrl(resolvedUrl: IResolvedUrl, request: IRequest): Promise<IResponse> {
        let url = request.url;
        if (url.startsWith("/")) {
            url = url.substr(1);
        }
        const odspResolvedUrl = resolvedUrl as IOdspResolvedUrl;
        const response: IResponse = {
            mimeType: "text/plain",
            value: `${odspResolvedUrl.siteUrl}/${url}?driveId=${encodeURIComponent(
                odspResolvedUrl.driveId)}&itemId=${encodeURIComponent(
                odspResolvedUrl.itemId,
            )}&path=${encodeURIComponent("/")}`,
            status: 200,
        };
        return response;
    }

    public createCreateNewRequest(siteUrl: string, driveId: string, filePath: string, fileName: string): IRequest {
        const createNewRequest: IRequest = {
            url: `${siteUrl}?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(filePath)}`,
            headers: {
                openMode: OpenMode.CreateNew,
                fileName,
            },
        };
        return createNewRequest;
    }

    private decodeOdspUrl(url: string): { siteUrl: string; driveId: string; itemId: string; path: string } {
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
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IUrlResolver, IExperimentalUrlResolver } from "@microsoft/fluid-driver-definitions";
import { ISummaryTree } from "@microsoft/fluid-protocol-definitions";
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
        if (request.headers && request.headers.newFileInfoPromise) {
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
            };
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
        };
    }

    public async createContainer(
        createNewSummary: ISummaryTree,
        request: IRequest,
    ): Promise<IOdspResolvedUrl> {
        if(!request.headers) {
            throw new Error("Request should contian headers!!");
        }
        assert(request.headers.newFileInfoPromise);
        const createNewOptions: ICreateNewOptions = {
            createNewSummary,
            newFileInfoPromise: request.headers.newFileInfoPromise,
        };
        return this.resolveHelperForCreateNew(request.url, createNewOptions);
    }

    private resolveHelperForCreateNew(url: string, createNewOptions: ICreateNewOptions): IOdspResolvedUrl {
        const [, queryString] = url.split("?");

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
        };
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

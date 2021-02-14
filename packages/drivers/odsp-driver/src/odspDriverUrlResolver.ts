/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    IFluidCodeDetails,
    IRequest,
    isFluidPackage,
} from "@fluidframework/core-interfaces";
import {
    IUrlResolver,
    IResolvedUrl,
    DriverHeader,
} from "@fluidframework/driver-definitions";
import { IOdspResolvedUrl } from "./contracts";
import { getHashedDocumentId } from "./odspUtils";
import { getApiRoot } from "./odspUrlHelper";
import { createOdspCreateContainerRequest } from "./createOdspCreateContainerRequest";

function getUrlBase(siteUrl: string, driveId: string, itemId: string, fileVersion?: string) {
    const siteOrigin = new URL(siteUrl).origin;
    const version = fileVersion ? `versions/${fileVersion}/` : "";
    return `${getApiRoot(siteOrigin)}/drives/${driveId}/items/${itemId}/${version}`;
}

function getSnapshotUrl(siteUrl: string, driveId: string, itemId: string, fileVersion?: string) {
    const urlBase = getUrlBase(siteUrl, driveId, itemId, fileVersion);
    return `${urlBase}opStream/snapshots`;
}

function getAttachmentPOSTUrl(siteUrl: string, driveId: string, itemId: string, fileVersion?: string) {
    const urlBase = getUrlBase(siteUrl, driveId, itemId, fileVersion);
    return `${urlBase}opStream/attachment`;
}

function getAttachmentGETUrl(siteUrl: string, driveId: string, itemId: string, fileVersion?: string) {
    const urlBase = getUrlBase(siteUrl, driveId, itemId, fileVersion);
    return `${urlBase}opStream/attachments`;
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

/**
 * Resolver to resolve urls like the ones created by createOdspUrl which is driver inner
 * url format. Ex: `${siteUrl}?driveId=${driveId}&itemId=${itemId}&path=${path}`
 */
export class OdspDriverUrlResolver implements IUrlResolver {
    constructor() { }

    public async resolve(request: IRequest): Promise<IOdspResolvedUrl> {
        if (request.headers && request.headers[DriverHeader.createNew]) {
            const [siteURL, queryString] = request.url.split("?");

            const searchParams = new URLSearchParams(queryString);
            const fileName = request.headers[DriverHeader.createNew].fileName;
            const driveID = searchParams.get("driveId");
            const filePath = searchParams.get("path");
            const packageName = searchParams.get("containerPackageName");
            if (!(fileName && siteURL && driveID && filePath !== null && filePath !== undefined)) {
                throw new Error("Proper new file params should be there!!");
            }
            return {
                endpoints: {
                    snapshotStorageUrl: "",
                    attachmentGETStorageUrl: "",
                    attachmentPOSTStorageUrl: "",
                },
                tokens: {},
                type: "fluid",
                url: `fluid-odsp://${siteURL}?${queryString}&version=null`,
                siteUrl: siteURL,
                hashedDocumentId: "",
                driveId: driveID,
                itemId: "",
                fileName,
                summarizer: false,
                codeHint: {
                    containerPackageName: packageName ? packageName : undefined,
                },
            };
        }
        const { siteUrl, driveId, itemId, path, containerPackageName, fileVersion } = decodeOdspUrl(request.url);
        const hashedDocumentId = getHashedDocumentId(driveId, itemId);
        assert(!hashedDocumentId.includes("/"), "Docid should not contain slashes!!");

        let documentUrl = `fluid-odsp://placeholder/placeholder/${hashedDocumentId}/${removeBeginningSlash(path)}`;

        if (request.url.length > 0) {
            // In case of any additional parameters add them back to the url
            const requestURL = new URL(request.url);
            const searchParams = requestURL.search;
            if (searchParams) {
                documentUrl += searchParams;
            }
        }

        const summarizer = !!request.headers?.[DriverHeader.summarizingClient];

        return {
            type: "fluid",
            endpoints: {
                snapshotStorageUrl: getSnapshotUrl(siteUrl, driveId, itemId, fileVersion),
                attachmentPOSTStorageUrl: getAttachmentPOSTUrl(siteUrl, driveId, itemId, fileVersion),
                attachmentGETStorageUrl: getAttachmentGETUrl(siteUrl, driveId, itemId, fileVersion),
            },
            tokens: {},
            url: documentUrl,
            hashedDocumentId,
            siteUrl,
            driveId,
            itemId,
            fileName: "",
            summarizer,
            codeHint: {
                containerPackageName,
            },
        };
    }

    public async getAbsoluteUrl(
        resolvedUrl: IResolvedUrl,
        relativeUrl: string,
        codeDetails?: IFluidCodeDetails,
    ): Promise<string> {
        let url = relativeUrl;
        if (url.startsWith("/")) {
            url = url.substr(1);
        }
        const odspResolvedUrl = resolvedUrl as IOdspResolvedUrl;
        let odspUrl = `${odspResolvedUrl.siteUrl}/${url}?driveId=${encodeURIComponent(odspResolvedUrl.driveId,
            )}&itemId=${encodeURIComponent(odspResolvedUrl.itemId)}&path=${encodeURIComponent("/")}`;
        const packageName = isFluidPackage(codeDetails?.package) ? codeDetails?.package.name : codeDetails?.package ??
             odspResolvedUrl.codeHint?.containerPackageName;
        if (packageName) {
            odspUrl += `&containerPackageName=${encodeURIComponent(packageName)}`;
        }
        if (odspResolvedUrl.fileVersion) {
            odspUrl += `&fileVersion=${encodeURIComponent(odspResolvedUrl.fileVersion)}`;
        }

        return odspUrl;
    }

    public createCreateNewRequest(
        siteUrl: string,
        driveId: string,
        filePath: string,
        fileName: string,
    ): IRequest {
        return createOdspCreateContainerRequest(siteUrl, driveId, filePath, fileName);
    }
}

function decodeOdspUrl(url: string): {
    siteUrl: string;
    driveId: string;
    itemId: string;
    path: string;
    containerPackageName?: string;
    fileVersion?: string;
} {
    const [siteUrl, queryString] = url.split("?");

    const searchParams = new URLSearchParams(queryString);

    const driveId = searchParams.get("driveId");
    const itemId = searchParams.get("itemId");
    const path = searchParams.get("path");
    const containerPackageName = searchParams.get("containerPackageName");
    const fileVersion = searchParams.get("fileVersion");

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
        containerPackageName: containerPackageName ? decodeURIComponent(containerPackageName) : undefined,
        fileVersion: fileVersion ? decodeURIComponent(fileVersion) : undefined,
    };
}

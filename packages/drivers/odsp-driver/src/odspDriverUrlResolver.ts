/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/common-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import {
    DriverErrorType,
    DriverHeader,
    IContainerPackageInfo,
    IResolvedUrl,
    IUrlResolver,
} from "@fluidframework/driver-definitions";
import { IOdspResolvedUrl, ShareLinkTypes, ShareLinkInfoType } from "@fluidframework/odsp-driver-definitions";
import { NonRetryableError } from "@fluidframework/driver-utils";
import { createOdspUrl } from "./createOdspUrl";
import { getApiRoot } from "./odspUrlHelper";
import { getOdspResolvedUrl } from "./odspUtils";
import { getHashedDocumentId } from "./odspPublicUtils";
import { ClpCompliantAppHeader } from "./contractsPublic";
import { pkgVersion } from "./packageVersion";

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

function getDeltaStorageUrl(siteUrl: string, driveId: string, itemId: string, fileVersion?: string) {
    const urlBase = getUrlBase(siteUrl, driveId, itemId, fileVersion);
    return `${urlBase}opStream`;
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
        if (request.headers?.[DriverHeader.createNew]) {
            const [siteURL, queryString] = request.url.split("?");

            const searchParams = new URLSearchParams(queryString);
            const fileName = request.headers[DriverHeader.createNew].fileName;
            const driveID = searchParams.get("driveId");
            const filePath = searchParams.get("path");
            const packageName = searchParams.get("containerPackageName");
            const createLinkType = searchParams.get("createLinkType");
            if (!(fileName && siteURL && driveID && filePath !== null && filePath !== undefined)) {
                throw new NonRetryableError(
                    "Proper new file params should be there!!",
                    DriverErrorType.genericError,
                    { driverVersion: pkgVersion });
            }
            let shareLinkInfo: ShareLinkInfoType | undefined;
            if (createLinkType && createLinkType in ShareLinkTypes) {
                shareLinkInfo = {
                    createLink: {
                        type: ShareLinkTypes[createLinkType],
                    },
                };
            }
            return {
                endpoints: {
                    snapshotStorageUrl: "",
                    attachmentGETStorageUrl: "",
                    attachmentPOSTStorageUrl: "",
                    deltaStorageUrl: "",
                },
                tokens: {},
                type: "fluid",
                odspResolvedUrl: true,
                id: "odspCreateNew",
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
                fileVersion: undefined,
                shareLinkInfo,
                isClpCompliantApp: request.headers?.[ClpCompliantAppHeader.isClpCompliantApp],
            };
        }
        const { siteUrl, driveId, itemId, path, containerPackageName, fileVersion } = decodeOdspUrl(request.url);
        const hashedDocumentId = await getHashedDocumentId(driveId, itemId);
        assert(!hashedDocumentId.includes("/"), 0x0a8 /* "Docid should not contain slashes!!" */);

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
            odspResolvedUrl: true,
            endpoints: {
                snapshotStorageUrl: getSnapshotUrl(siteUrl, driveId, itemId, fileVersion),
                attachmentPOSTStorageUrl: getAttachmentPOSTUrl(siteUrl, driveId, itemId, fileVersion),
                attachmentGETStorageUrl: getAttachmentGETUrl(siteUrl, driveId, itemId, fileVersion),
                deltaStorageUrl: getDeltaStorageUrl(siteUrl, driveId, itemId, fileVersion),
            },
            id: hashedDocumentId,
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
            fileVersion,
            isClpCompliantApp: request.headers?.[ClpCompliantAppHeader.isClpCompliantApp],
        };
    }

    public async getAbsoluteUrl(
        resolvedUrl: IResolvedUrl,
        relativeUrl: string,
        packageInfoSource?: IContainerPackageInfo,
    ): Promise<string> {
        let dataStorePath = relativeUrl;
        if (dataStorePath.startsWith("/")) {
            dataStorePath = dataStorePath.substr(1);
        }
        const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);
        // back-compat: GitHub #9653
        const isFluidPackage = (pkg: any) =>
            typeof pkg === "object"
            && typeof pkg?.name === "string"
            && typeof pkg?.fluid === "object";
        let containerPackageName;
        if (packageInfoSource && "name" in packageInfoSource) {
            containerPackageName = packageInfoSource.name;
            // packageInfoSource is cast to any as it is typed to IContainerPackageInfo instead of IFluidCodeDetails
        } else if (isFluidPackage((packageInfoSource as any)?.package)) {
            containerPackageName = (packageInfoSource as any)?.package.name;
        } else {
            containerPackageName = (packageInfoSource as any)?.package;
        }
        containerPackageName = containerPackageName ?? odspResolvedUrl.codeHint?.containerPackageName;

        return createOdspUrl({
            ... odspResolvedUrl,
            containerPackageName,
            dataStorePath,
        });
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

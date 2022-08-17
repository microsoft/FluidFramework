/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { assert, Uint8ArrayToString } from "@fluidframework/common-utils";
import { getDocAttributesFromProtocolSummary, NonRetryableError } from "@fluidframework/driver-utils";
import { getGitType } from "@fluidframework/protocol-base";
import { SummaryType, ISummaryTree, ISummaryBlob } from "@fluidframework/protocol-definitions";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
    IFileEntry,
    InstrumentedStorageTokenFetcher,
    IOdspResolvedUrl,
    OdspErrorType,
    ShareLinkInfoType,
    ISharingLinkKind,
    ShareLinkTypes,
} from "@fluidframework/odsp-driver-definitions";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import {
    IOdspSummaryTree,
    OdspSummaryTreeValue,
    OdspSummaryTreeEntry,
    ICreateFileResponse,
    IOdspSummaryPayload,
} from "./contracts";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import {
    buildOdspShareLinkReqParams,
    createCacheSnapshotKey,
    getWithRetryForTokenRefresh,
    INewFileInfo,
    getOrigin,
    maxUmpPostBodySize,
} from "./odspUtils";
import { ISnapshotContents } from "./odspPublicUtils";
import { createOdspUrl } from "./createOdspUrl";
import { getApiRoot } from "./odspUrlHelper";
import { EpochTracker } from "./epochTracker";
import { OdspDriverUrlResolver } from "./odspDriverUrlResolver";
import { convertCreateNewSummaryTreeToTreeAndBlobs } from "./createNewUtils";
import { runWithRetry } from "./retryUtils";
import { pkgVersion as driverVersion } from "./packageVersion";
import { ClpCompliantAppHeader } from "./contractsPublic";

const isInvalidFileName = (fileName: string): boolean => {
    const invalidCharsRegex = /["*/:<>?\\|]+/g;
    return !!fileName.match(invalidCharsRegex);
};

/**
 * Creates a new Fluid file.
 * Returns resolved url
 */
export async function createNewFluidFile(
    getStorageToken: InstrumentedStorageTokenFetcher,
    newFileInfo: INewFileInfo,
    logger: ITelemetryLogger,
    createNewSummary: ISummaryTree | undefined,
    epochTracker: EpochTracker,
    fileEntry: IFileEntry,
    createNewCaching: boolean,
    forceAccessTokenViaAuthorizationHeader: boolean,
    isClpCompliantApp?: boolean,
    enableSingleRequestForShareLinkWithCreate?: boolean,
    enableShareLinkWithCreate?: boolean,
): Promise<IOdspResolvedUrl> {
    // Check for valid filename before the request to create file is actually made.
    if (isInvalidFileName(newFileInfo.filename)) {
        throw new NonRetryableError(
            // pre-0.58 error message: Invalid filename
            "Invalid filename for createNew", OdspErrorType.invalidFileNameError, { driverVersion });
    }

    let itemId: string;
    let summaryHandle: string = "";
    let shareLinkInfo: ShareLinkInfoType | undefined;
    if (createNewSummary === undefined) {
        itemId = await createNewEmptyFluidFile(
            getStorageToken, newFileInfo, logger, epochTracker, forceAccessTokenViaAuthorizationHeader);
    } else {
        const content = await createNewFluidFileFromSummary(
            getStorageToken,
            newFileInfo,
            logger,
            createNewSummary,
            epochTracker,
            forceAccessTokenViaAuthorizationHeader,
        );
        itemId = content.itemId;
        summaryHandle = content.id;

        shareLinkInfo = extractShareLinkData(
            newFileInfo.createLinkType,
            content,
            enableSingleRequestForShareLinkWithCreate,
            enableShareLinkWithCreate);
    }

    const odspUrl = createOdspUrl({ ...newFileInfo, itemId, dataStorePath: "/" });
    const resolver = new OdspDriverUrlResolver();
    const odspResolvedUrl = await resolver.resolve({
        url: odspUrl,
        headers: { [ClpCompliantAppHeader.isClpCompliantApp]: isClpCompliantApp },
    });
    fileEntry.docId = odspResolvedUrl.hashedDocumentId;
    fileEntry.resolvedUrl = odspResolvedUrl;

    odspResolvedUrl.shareLinkInfo = shareLinkInfo;

    if (createNewSummary !== undefined && createNewCaching) {
        assert(summaryHandle !== undefined, 0x203 /* "Summary handle is undefined" */);
        // converting summary and getting sequence number
        const snapshot: ISnapshotContents = convertCreateNewSummaryTreeToTreeAndBlobs(createNewSummary, summaryHandle);
        // caching the converted summary
        await epochTracker.put(createCacheSnapshotKey(odspResolvedUrl), snapshot);
    }
    return odspResolvedUrl;
}

/**
 * If user requested creation of a sharing link along with the creation of the file by providing either
 * createLinkType (now deprecated) or createLinkScope in the request parameters, extract and save
 * sharing link information from the response if it is available.
 * In case there was an error in creation of the sharing link, error is provided back in the response,
 * and does not impact the creation of file in ODSP.
 * @param requestedSharingLinkKind - Kind of sharing link requested to be created along with the creation of file.
 * @param response - Response object received from the /snapshot api call
 * @returns Sharing link information received in the response from a successful creation of a file.
 */
function extractShareLinkData(
    requestedSharingLinkKind: ShareLinkTypes | ISharingLinkKind | undefined,
    response: ICreateFileResponse,
    enableSingleRequestForShareLinkWithCreate?: boolean,
    enableShareLinkWithCreate?: boolean,
): ShareLinkInfoType | undefined {
    if (!requestedSharingLinkKind) {
        return;
    }
    let shareLinkInfo: ShareLinkInfoType | undefined;
    if (enableSingleRequestForShareLinkWithCreate) {
        const { sharing } = response;
        if (!sharing) {
            return;
        }
        shareLinkInfo = {
            createLink: {
                type: requestedSharingLinkKind,
                link: sharing.sharingLink ? {
                    scope: sharing.sharingLink.scope,
                    role: sharing.sharingLink.type,
                    webUrl: sharing.sharingLink.webUrl,
                    ...sharing.sharingLink,
                } : undefined,
                error: sharing.error,
                shareId: sharing.shareId,
            },
        };
    } else if (enableShareLinkWithCreate) {
        const { sharing, sharingLink, sharingLinkErrorReason } = response;
        if (!sharingLink && !sharingLinkErrorReason) {
            return;
        }
        shareLinkInfo = {
            createLink: {
                type: requestedSharingLinkKind,
                link: sharingLink,
                error: sharingLinkErrorReason,
                shareId: sharing?.shareId,
            },
        };
    }
    return shareLinkInfo;
}

export async function createNewEmptyFluidFile(
    getStorageToken: InstrumentedStorageTokenFetcher,
    newFileInfo: INewFileInfo,
    logger: ITelemetryLogger,
    epochTracker: EpochTracker,
    forceAccessTokenViaAuthorizationHeader: boolean,
): Promise<string> {
    const filePath = newFileInfo.filePath ? encodeURIComponent(`/${newFileInfo.filePath}`) : "";
    // add .tmp extension to empty file (host is expected to rename)
    const encodedFilename = encodeURIComponent(`${newFileInfo.filename}.tmp`);
    const initialUrl =
        `${getApiRoot(getOrigin(newFileInfo.siteUrl))}/drives/${newFileInfo.driveId}/items/root:/${filePath
        }/${encodedFilename}:/content?@name.conflictBehavior=rename&select=id,name,parentReference`;

    return getWithRetryForTokenRefresh(async (options) => {
        const storageToken = await getStorageToken(options, "CreateNewFile");

        return PerformanceEvent.timedExecAsync(
            logger,
            { eventName: "createNewEmptyFile" },
            async (event) => {
                const { url, headers } = getUrlAndHeadersWithAuth(
                    initialUrl, storageToken, forceAccessTokenViaAuthorizationHeader);
                headers["Content-Type"] = "application/json";

                const fetchResponse = await runWithRetry(
                    async () => epochTracker.fetchAndParseAsJSON<ICreateFileResponse>(
                        url,
                        {
                            body: undefined,
                            headers,
                            method: "PUT",
                        },
                        "createFile",
                    ),
                    "createFile",
                    logger,
                );

                const content = fetchResponse.content;
                if (!content || !content.id) {
                    throw new NonRetryableError(
                        // pre-0.58 error message: ODSP CreateFile call returned no item ID
                        "ODSP CreateFile call returned no item ID (for empty file)",
                        DriverErrorType.incorrectServerResponse,
                        { driverVersion });
                }
                event.end({
                    headers: Object.keys(headers).length !== 0 ? true : undefined,
                    ...fetchResponse.propsToLog,
                });
                return content.id;
            },
            { end: true, cancel: "error" });
    });
}

export async function createNewFluidFileFromSummary(
    getStorageToken: InstrumentedStorageTokenFetcher,
    newFileInfo: INewFileInfo,
    logger: ITelemetryLogger,
    createNewSummary: ISummaryTree,
    epochTracker: EpochTracker,
    forceAccessTokenViaAuthorizationHeader: boolean,
): Promise<ICreateFileResponse> {
    const filePath = newFileInfo.filePath ? encodeURIComponent(`/${newFileInfo.filePath}`) : "";
    const encodedFilename = encodeURIComponent(newFileInfo.filename);
    const baseUrl =
        `${getApiRoot(getOrigin(newFileInfo.siteUrl))}/drives/${newFileInfo.driveId}/items/root:` +
        `${filePath}/${encodedFilename}`;

    const containerSnapshot = convertSummaryIntoContainerSnapshot(createNewSummary);

    // Build share link parameter based on the createLinkType provided so that the
    // snapshot api can create and return the share link along with creation of file in the response.
    const createShareLinkParam = buildOdspShareLinkReqParams(newFileInfo.createLinkType);
    const initialUrl =
        `${baseUrl}:/opStream/snapshots/snapshot${createShareLinkParam ? `?${createShareLinkParam}` : ""}`;

    return getWithRetryForTokenRefresh(async (options) => {
        const storageToken = await getStorageToken(options, "CreateNewFile");

        return PerformanceEvent.timedExecAsync(
            logger,
            { eventName: "createNewFile" },
            async (event) => {
                const snapshotBody = JSON.stringify(containerSnapshot);
                let url: string;
                let headers: { [index: string]: string; };
                let addInBody = false;
                const formBoundary = uuid();
                let postBody = `--${formBoundary}\r\n`;
                postBody += `Authorization: Bearer ${storageToken}\r\n`;
                postBody += `X-HTTP-Method-Override: POST\r\n`;
                postBody += `Content-Type: application/json\r\n`;
                postBody += `_post: 1\r\n`;
                postBody += `\r\n${snapshotBody}\r\n`;
                postBody += `\r\n--${formBoundary}--`;

                if (postBody.length <= maxUmpPostBodySize) {
                    const urlObj = new URL(initialUrl);
                    urlObj.searchParams.set("ump", "1");
                    url = urlObj.href;
                    headers = {
                        "Content-Type": `multipart/form-data;boundary=${formBoundary}`,
                    };
                    addInBody = true;
                } else {
                    const parts = getUrlAndHeadersWithAuth(
                        initialUrl, storageToken, forceAccessTokenViaAuthorizationHeader);
                    url = parts.url;
                    headers = {
                        ...parts.headers,
                        "Content-Type": "application/json",
                    };
                    postBody = snapshotBody;
                }

                const fetchResponse = await runWithRetry(
                    async () => epochTracker.fetchAndParseAsJSON<ICreateFileResponse>(
                        url,
                        {
                            body: postBody,
                            headers,
                            method: "POST",
                        },
                        "createFile",
                        addInBody,
                    ),
                    "createFile",
                    logger,
                );

                const content = fetchResponse.content;
                if (!content || !content.itemId) {
                    throw new NonRetryableError(
                        "ODSP CreateFile call returned no item ID",
                        DriverErrorType.incorrectServerResponse,
                        { driverVersion });
                }
                event.end({
                    headers: Object.keys(headers).length !== 0 ? true : undefined,
                    attempts: options.refresh ? 2 : 1,
                    ...fetchResponse.propsToLog,
                });
                return content;
            },
        );
    });
}

function convertSummaryIntoContainerSnapshot(createNewSummary: ISummaryTree) {
    const appSummary = createNewSummary.tree[".app"] as ISummaryTree;
    const protocolSummary = createNewSummary.tree[".protocol"] as ISummaryTree;
    if (!(appSummary && protocolSummary)) {
        throw new Error("App and protocol summary required for create new path!!");
    }
    const documentAttributes = getDocAttributesFromProtocolSummary(protocolSummary);
    const attributesSummaryBlob: ISummaryBlob = {
        type: SummaryType.Blob,
        content: JSON.stringify(documentAttributes),
    };
    protocolSummary.tree.attributes = attributesSummaryBlob;
    const convertedCreateNewSummary: ISummaryTree = {
        type: SummaryType.Tree,
        tree: {
            ".protocol": protocolSummary,
            ".app": appSummary,
        },
    };
    const snapshotTree = convertSummaryToSnapshotTreeForCreateNew(convertedCreateNewSummary);
    const snapshot: IOdspSummaryPayload = {
        entries: snapshotTree.entries ?? [],
        message: "app",
        sequenceNumber: documentAttributes.sequenceNumber,
        type: "container",
    };
    return snapshot;
}

/**
 * Converts a summary tree to ODSP tree
 */
export function convertSummaryToSnapshotTreeForCreateNew(summary: ISummaryTree): IOdspSummaryTree {
    const snapshotTree: IOdspSummaryTree = {
        type: "tree",
        entries: [],
    };

    const keys = Object.keys(summary.tree);
    for (const key of keys) {
        const summaryObject = summary.tree[key];

        let value: OdspSummaryTreeValue;
        // Tracks if an entry is unreferenced. Currently, only tree entries can be marked as unreferenced. If the
        // property is not present, the tree entry is considered referenced. If the property is present and is true,
        // the tree entry is considered unreferenced.
        let unreferenced: true | undefined;

        switch (summaryObject.type) {
            case SummaryType.Tree: {
                value = convertSummaryToSnapshotTreeForCreateNew(summaryObject);
                unreferenced = summaryObject.unreferenced;
                break;
            }
            case SummaryType.Blob: {
                const content = typeof summaryObject.content === "string" ?
                    summaryObject.content : Uint8ArrayToString(summaryObject.content, "base64");
                const encoding = typeof summaryObject.content === "string" ? "utf-8" : "base64";

                value = {
                    type: "blob",
                    content,
                    encoding,
                };
                break;
            }
            case SummaryType.Handle: {
                throw new Error("No handle should be present for first summary!!");
            }
            default: {
                throw new Error(`Unknown tree type ${summaryObject.type}`);
            }
        }

        const entry: OdspSummaryTreeEntry = {
            path: encodeURIComponent(key),
            type: getGitType(summaryObject),
            value,
            unreferenced,
        };
        snapshotTree.entries?.push(entry);
    }

    return snapshotTree;
}

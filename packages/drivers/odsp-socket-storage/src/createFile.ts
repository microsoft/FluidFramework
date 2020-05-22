/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { getGitType } from "@fluidframework/protocol-base";
import { getDocAttributesFromProtocolSummary } from "@fluidframework/driver-utils";
import { SummaryType, ISummaryTree, ISummaryBlob, MessageType } from "@fluidframework/protocol-definitions";
import {
    IOdspResolvedUrl,
    ISnapshotTree,
    SnapshotTreeValue,
    SnapshotTreeEntry,
    SnapshotType,
} from "./contracts";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import { IOdspCache } from "./odspCache";
import { OdspDriverUrlResolver } from "./odspDriverUrlResolver";
import {
    getWithRetryForTokenRefresh,
    throwOdspNetworkError,
    fetchHelper,
    INewFileInfo,
    invalidFileNameStatusCode,
    getOrigin,
} from "./odspUtils";
import { createOdspUrl } from "./createOdspUrl";
import { getApiRoot } from "./odspUrlHelper";
import { IFetchWrapper } from "./fetchWrapper";

export interface IFileCreateResponse {
    siteUrl: string;
    itemId: string;
    filename: string;
    driveId: string;
}

const isInvalidFileName = (fileName: string): boolean => {
    const invalidCharsRegex = /["*/:<>?\\|]+/g;
    return !!fileName.match(invalidCharsRegex);
};

export function getKeyFromFileInfo(fileInfo: INewFileInfo): string {
    return `${fileInfo.siteUrl}:${fileInfo.driveId}:${fileInfo.filePath}:${fileInfo.filename}`;
}

/**
 * Creates new fluid file before returning a real resolved url
 */
export async function createNewFluidFile(
    getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
    newFileInfo: INewFileInfo,
    cache: IOdspCache,
    storageFetchWrapper: IFetchWrapper,
    createNewSummary?: ISummaryTree,
): Promise<IOdspResolvedUrl> {
    // Check for valid filename before the request to create file is actually made.
    if (isInvalidFileName(newFileInfo.filename)) {
        throwOdspNetworkError("Invalid filename. Please try again.", invalidFileNameStatusCode, false);
    }

    const createFileAndResolveUrl = async () => {
        const fileResponse: IFileCreateResponse = await createNewOdspFile(
            newFileInfo,
            getStorageToken,
            storageFetchWrapper,
            createNewSummary);
        const odspUrl = createOdspUrl(fileResponse.siteUrl, fileResponse.driveId, fileResponse.itemId, "/");
        const resolver = new OdspDriverUrlResolver();

        if (newFileInfo.callback) {
            newFileInfo.callback(fileResponse.itemId, fileResponse.filename);
        }

        return resolver.resolve({ url: odspUrl });
    };

    const key = getKeyFromFileInfo(newFileInfo);
    return cache.fileUrlCache.addOrGet(key, createFileAndResolveUrl);
}

/**
 * Creates a new fluid file. '.fluid' is appended to the filename
 */
async function createNewOdspFile(
    newFileInfo: INewFileInfo,
    getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
    storageFetchWrapper: IFetchWrapper,
    createNewSummary?: ISummaryTree,
): Promise<IFileCreateResponse> {
    const fileResponse = await getWithRetryForTokenRefresh(async (refresh: boolean) => {
        const storageToken = await getStorageToken(newFileInfo.siteUrl, refresh);

        const encodedFilename = encodeURIComponent(`${newFileInfo.filename}.fluid`);

        let fetchResponse;
        if (createNewSummary) {
            const containerSnapshot: ISnapshotTree = convertSummaryIntoContainerSnapshot(createNewSummary);
            const initialUrl =
                `${getApiRoot(getOrigin(newFileInfo.siteUrl))}/drives/${newFileInfo.driveId}/items/root:/` +
                `${encodeURIComponent(newFileInfo.filePath)}/${encodedFilename}` +
                `:/opStream/snapshots/snapshot`;
            const { url, headers } = getUrlAndHeadersWithAuth(initialUrl, storageToken);
            headers["Content-Type"] = "application/json";

            const postBody = JSON.stringify(containerSnapshot);
            fetchResponse = await storageFetchWrapper.post(url, postBody, headers);

            const content = await fetchResponse.content;
            if (!content || !content.itemId) {
                throwOdspNetworkError("Could not parse item from Vroom response", fetchResponse.status, false);
            }
            return {
                itemId: content.itemId,
                siteUrl: newFileInfo.siteUrl,
                driveId: newFileInfo.driveId,
                filename: newFileInfo.filename,
            };
        } else {
            const initialUrl =
                `${getApiRoot(getOrigin(newFileInfo.siteUrl))}/drives/${newFileInfo.driveId}/items/root:/` +
                `${encodeURIComponent(
                    newFileInfo.filePath,
                )}/${encodedFilename}:/content?@name.conflictBehavior=rename&select=id,name,parentReference`;
            const { url, headers } = getUrlAndHeadersWithAuth(initialUrl, storageToken);
            fetchResponse = await fetchHelper(url, {
                method: "PUT",
                headers,
            });

            const content = await fetchResponse.content;
            if (!content || !content.id) {
                throwOdspNetworkError("Could not parse drive item from Vroom response", fetchResponse.status, false);
            }
            return {
                itemId: content.id,
                siteUrl: newFileInfo.siteUrl,
                driveId: newFileInfo.driveId,
                filename: content.name,
            };
        }
    });
    return fileResponse;
}

function convertSummaryIntoContainerSnapshot(createNewSummary: ISummaryTree) {
    const appSummary = createNewSummary.tree[".app"] as ISummaryTree;
    const protocolSummary = createNewSummary.tree[".protocol"] as ISummaryTree;
    if (!(appSummary && protocolSummary)) {
        throw new Error("App and protocol summary required for create new path!!");
    }
    const documentAttributes = getDocAttributesFromProtocolSummary(protocolSummary);
    // Currently for the scenarios we have we don't have ops in the detached container. So the
    // sequence number would always be 0 here. However odsp requires to have atleast 1 snapshot.
    assert(documentAttributes.sequenceNumber === 0, "Sequence No for detached container snapshot should be 0");
    documentAttributes.sequenceNumber = 1;
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
    const snapshot = {
        entries: snapshotTree.entries ?? [],
        message: "app",
        sequenceNumber: 1,
        sha: snapshotTree.id,
        type: SnapshotType.Container,
        ops: [{
            op: {
                clientId: null,
                clientSequenceNumber: -1,
                contents: null,
                minimumSequenceNumber: 0,
                referenceSequenceNumber: -1,
                sequenceNumber: 1,
                timestamp: Date.now(),
                traces: [],
                type: MessageType.NoOp,
            },
            sequenceNumber: 1,
        }],
    };
    return snapshot;
}

/**
 * Converts a summary tree to ODSP tree
 */
export function convertSummaryToSnapshotTreeForCreateNew(summary: ISummaryTree): ISnapshotTree {
    const snapshotTree: ISnapshotTree = {
        entries: [],
    }!;

    const keys = Object.keys(summary.tree);
    for (const key of keys) {
        const summaryObject = summary.tree[key];

        let value: SnapshotTreeValue;

        switch (summaryObject.type) {
            case SummaryType.Tree: {
                value = convertSummaryToSnapshotTreeForCreateNew(summaryObject);
                break;
            }
            case SummaryType.Blob: {
                const content = typeof summaryObject.content === "string" ?
                    summaryObject.content : summaryObject.content.toString("base64");
                const encoding = typeof summaryObject.content === "string" ? "utf-8" : "base64";

                value = {
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

        const entry: SnapshotTreeEntry = {
            mode: "100644",
            path: encodeURIComponent(key),
            type: getGitType(summaryObject),
            value,
        };
        snapshotTree.entries?.push(entry);
    }

    return snapshotTree;
}

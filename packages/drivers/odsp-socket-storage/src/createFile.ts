/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { Deferred } from "@microsoft/fluid-common-utils";
import { getGitType } from "@microsoft/fluid-protocol-base";
import { getDocAttributesFromProtocolSummary } from "@microsoft/fluid-driver-utils";
import { SummaryType, ISummaryTree, ISummaryBlob, MessageType } from "@microsoft/fluid-protocol-definitions";
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
import { getWithRetryForTokenRefresh, throwOdspNetworkError, fetchHelper } from "./odspUtils";
import { createOdspUrl } from "./createOdspUrl";
import { getApiRoot } from "./odspUrlHelper";
import { getOrigin } from "./vroom";

export interface INewFileInfo {
    siteUrl: string;
    driveId: string;
    fileName: string;
    filePath: string;
    callback?(itemId: string, filename: string): void;
}

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
    return `${fileInfo.siteUrl}:${fileInfo.driveId}:${fileInfo.filePath}:${fileInfo.fileName}`;
}

/**
 * Creates new fluid file before returning a real resolved url
 */
export async function createNewFluidFile(
    getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
    newFileInfoPromise: Promise<INewFileInfo> | undefined,
    cache: IOdspCache,
    urlResolver: OdspDriverUrlResolver,
    createNewSummary?: ISummaryTree,
): Promise<IOdspResolvedUrl> {
    if (!newFileInfoPromise) {
        throw new Error("Odsp driver needs to create a new file but no newFileInfo supplied");
    }
    const newFileInfo = await newFileInfoPromise;

    const key = getKeyFromFileInfo(newFileInfo);
    const responseP: Promise<IOdspResolvedUrl> = await cache.sessionStorage.get(key);
    let resolvedUrl: IOdspResolvedUrl;
    if (responseP !== undefined) {
        return responseP;
    }
    // Check for valid filename before the request to create file is actually made.
    if (isInvalidFileName(newFileInfo.fileName)) {
        throw new Error("Invalid filename. Please try again.");
    }
    let containerSnapshot: ISnapshotTree | undefined;
    if (createNewSummary) {
        containerSnapshot = convertSummaryIntoContainerSnapshot(createNewSummary);
    }
    // We don't want to create a new file for different instances of a driver. So we cache the
    // response of previous create request as a deferred promise because this is async and we don't
    // know the order of execution of this code by driver instances.
    const odspResolvedUrlDeferred = new Deferred<IOdspResolvedUrl>();
    cache.sessionStorage.put(key, odspResolvedUrlDeferred.promise);
    let fileResponse: IFileCreateResponse;
    try {
        fileResponse = await createNewFluidFileHelper(newFileInfo, getStorageToken, containerSnapshot);
        const odspUrl = createOdspUrl(fileResponse.siteUrl, fileResponse.driveId, fileResponse.itemId, "/");
        resolvedUrl = await urlResolver.resolve({ url: odspUrl });
    } catch (error) {
        odspResolvedUrlDeferred.reject(error);
        cache.sessionStorage.remove(key);
        throw error;
    }
    odspResolvedUrlDeferred.resolve(resolvedUrl);
    if (newFileInfo.callback) {
        newFileInfo.callback(fileResponse.itemId, fileResponse.filename);
    }
    return resolvedUrl;
}

/**
 * Creates a new fluid file. '.fluid' is appended to the filename
 */
async function createNewFluidFileHelper(
    newFileInfo: INewFileInfo,
    getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
    containerSnapshot?: ISnapshotTree,
): Promise<IFileCreateResponse> {
    const fileResponse = await getWithRetryForTokenRefresh(async (refresh: boolean) => {
        const storageToken = await getStorageToken(newFileInfo.siteUrl, refresh);

        const encodedFilename = encodeURIComponent(`${newFileInfo.fileName}.fluid`);

        let fetchResponse;
        if (containerSnapshot) {
            const initialUrl =
                `${getApiRoot(getOrigin(newFileInfo.siteUrl))}/drives/${newFileInfo.driveId}/items/root:/` +
                `${encodeURIComponent(newFileInfo.filePath)}/${encodedFilename}` +
                `:/opStream/snapshots/snapshot`;
            const { url, headers } = getUrlAndHeadersWithAuth(initialUrl, storageToken);
            headers["Content-Type"] = "application/json";
            // Currently the api to create new file with snapshot is under a feature gate. So we have to
            // add this header to enter into that gate.
            headers["X-Tempuse-Allow-Singlepost"] = "1";
            const postBody = JSON.stringify(containerSnapshot);
            fetchResponse = await fetchHelper(url, {
                body: postBody,
                method: "POST",
                headers,
            });

            const content = await fetchResponse.content;
            if (!content || !content.itemId) {
                throwOdspNetworkError("Could not parse drive item from Vroom response", fetchResponse.status, false);
            }
            return {
                itemId: content.itemId,
                siteUrl: newFileInfo.siteUrl,
                driveId: newFileInfo.driveId,
                filename: newFileInfo.fileName,
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

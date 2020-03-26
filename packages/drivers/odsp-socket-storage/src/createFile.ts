/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@microsoft/fluid-common-utils";
import { getGitType } from "@microsoft/fluid-protocol-base";
import { getDocAttributesAndQuorumValuesFromProtocolSummary } from "@microsoft/fluid-driver-utils";
import { SummaryType, ISummaryTree, ISummaryBlob, MessageType } from "@microsoft/fluid-protocol-definitions";
import {
    IOdspResolvedUrl,
    ISnapshotTree,
    SnapshotTreeValue,
    ISnapshotTreeBaseEntry,
    SnapshotTreeEntry,
    SnapshotType,
} from "./contracts";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import { IOdspCache } from "./odspCache";
import { OdspDriverUrlResolver } from "./odspDriverUrlResolver";
import { getWithRetryForTokenRefresh, throwOdspNetworkError } from "./odspUtils";
import { createOdspUrl } from "./createOdspUrl";

export interface INewFileInfo {
    siteUrl: string;
    driveId: string;
    filename: string;
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
    return `${fileInfo.siteUrl}:${fileInfo.driveId}:${fileInfo.filePath}:${fileInfo.filename}`;
}

/**
 * Creates new fluid file before returning a real resolved url
 */
export async function createNewFluidFile(
    getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
    newFileInfoPromise: Promise<INewFileInfo> | undefined,
    cache: IOdspCache,
    createNewSummary: ISummaryTree | undefined,
): Promise<IOdspResolvedUrl> {
    if (!newFileInfoPromise) {
        throw new Error("Odsp driver needs to create a new file but no newFileInfo supplied");
    }
    const newFileInfo = await newFileInfoPromise;

    const key = getKeyFromFileInfo(newFileInfo);
    const responseP: Promise<IOdspResolvedUrl> = cache.sessionStorage.get(key);
    let resolvedUrl: IOdspResolvedUrl;
    if (responseP !== undefined) {
        return responseP;
    }
    // Check for valid filename before the request to create file is actually made.
    if (isInvalidFileName(newFileInfo.filename)) {
        throw new Error("Invalid filename. Please try again.");
    }
    let containerSnapshot: ISnapshotTree | undefined;
    if (createNewSummary) {
        const appSummary = createNewSummary.tree[".app"] as ISummaryTree;
        const protocolSummary = createNewSummary.tree[".protocol"] as ISummaryTree;
        if (!(appSummary && protocolSummary)) {
            throw new Error("App and protocol summary required for create new path!!");
        }
        containerSnapshot = await convertSummaryIntoContainerSnapshot(appSummary, protocolSummary);
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
        const resolver = new OdspDriverUrlResolver();
        resolvedUrl = await resolver.resolve({ url: odspUrl });
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
    containerSnapshot: ISnapshotTree | undefined,
): Promise<IFileCreateResponse> {
    const fileResponse = await getWithRetryForTokenRefresh(async (refresh: boolean) => {
        const storageToken = await getStorageToken(newFileInfo.siteUrl, refresh);

        const encodedFilename = encodeURIComponent(`${newFileInfo.filename}.fluid`);

        let fetchResponse: Response;
        if (containerSnapshot) {
            const initialUrl =
                `${newFileInfo.siteUrl}/_api/v2.1/drives/${newFileInfo.driveId}/items/root:/` +
                `${encodeURIComponent(newFileInfo.filePath)}/${encodedFilename}` +
                `:/opStream/snapshots/snapshot?@name.conflictBehavior=rename`;
            const { url, headers } = getUrlAndHeadersWithAuth(initialUrl, storageToken);
            headers["Content-Type"] = "application/json";
            headers["X-Tempuse-Allow-Singlepost"] = "1";
            const postBody = JSON.stringify(containerSnapshot);
            fetchResponse = await fetch(url, {
                body: postBody,
                method: "POST",
                headers,
            });
            if (fetchResponse.status !== 200) {
                // We encounter status=-1 if url path including filename length exceeds 400 characters.
                if (fetchResponse.status === -1) {
                    throwOdspNetworkError(`Unknown Error. File path length exceeding 400 characters
                        could cause this error`, fetchResponse.status, false);
                }

                throwOdspNetworkError("Failed to create file with snapshot", fetchResponse.status, true);
            }

            const response = await fetchResponse.json();
            if (!response || !response.itemId) {
                throwOdspNetworkError("Could not parse drive item from Vroom response", fetchResponse.status, false);
            }
            return {
                itemId: response.itemId,
                siteUrl: newFileInfo.siteUrl,
                driveId: newFileInfo.driveId,
                filename: newFileInfo.filename,
            };
        } else {
            const initialUrl =
                `${newFileInfo.siteUrl}/_api/v2.1/drives/${newFileInfo.driveId}/items/root:/${encodeURIComponent(
                    newFileInfo.filePath,
                )}/${encodedFilename}:/content?@name.conflictBehavior=rename&select=id,name,parentReference`;
            const { url, headers } = getUrlAndHeadersWithAuth(initialUrl, storageToken);
            fetchResponse = await fetch(url, {
                method: "PUT",
                headers,
            });
            if (fetchResponse.status !== 201) {
                // We encounter status=-1 if url path including filename length exceeds 400 characters.
                if (fetchResponse.status === -1) {
                    throwOdspNetworkError(`Unknown Error. File path length exceeding 400 characters
                        could cause this error`, fetchResponse.status, false);
                }

                throwOdspNetworkError("Failed to create file", fetchResponse.status, true);
            }

            const item = await fetchResponse.json();
            if (!item || !item.id) {
                throwOdspNetworkError("Could not parse drive item from Vroom response", fetchResponse.status, false);
            }
            return {
                itemId: item.id,
                siteUrl: newFileInfo.siteUrl,
                driveId: newFileInfo.driveId,
                filename: item.name,
            };
        }
    });
    return fileResponse;
}

async function convertSummaryIntoContainerSnapshot(appSummary: ISummaryTree, protocolSummary: ISummaryTree) {
    const {documentAttributes} = getDocAttributesAndQuorumValuesFromProtocolSummary(protocolSummary);
    documentAttributes.sequenceNumber = 1;
    const attributesSummaryBlob: ISummaryBlob = {
        type: SummaryType.Blob,
        content: JSON.stringify(documentAttributes),
    };
    protocolSummary.tree.attributes = attributesSummaryBlob;
    const createNewSummary: ISummaryTree = {
        type: SummaryType.Tree,
        tree: {
            ".protocol": protocolSummary,
            ".app": appSummary,
        },
    };
    const snapshotTree = await convertSummaryToSnapshotTreeForCreateNew(createNewSummary);
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
export async function convertSummaryToSnapshotTreeForCreateNew(summary: ISummaryTree): Promise<ISnapshotTree> {
    const snapshotTree: ISnapshotTree = {
        entries: [],
    }!;

    const keys = Object.keys(summary.tree);
    for (const key of keys) {
        const summaryObject = summary.tree[key];

        let id: string | undefined;
        let value: SnapshotTreeValue | undefined;

        switch (summaryObject.type) {
            case SummaryType.Tree: {
                value = await convertSummaryToSnapshotTreeForCreateNew(summaryObject);
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

        const baseEntry: ISnapshotTreeBaseEntry = {
            mode: "100644",
            path: encodeURIComponent(key),
            type: getGitType(summaryObject),
        };

        let entry: SnapshotTreeEntry;

        if (value) {
            entry = {
                ...baseEntry,
                id,
                value,
            };

        } else if (id) {
            entry = {
                ...baseEntry,
                id,
            };

        } else {
            throw new Error(`Invalid tree entry for ${summaryObject.type}`);
        }

        snapshotTree.entries?.push(entry);
    }

    return snapshotTree;
}

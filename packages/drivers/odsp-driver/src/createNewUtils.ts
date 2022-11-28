/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { ISummaryBlob, ISummaryTree, SummaryType, ISnapshotTree } from "@fluidframework/protocol-definitions";
import { getDocAttributesFromProtocolSummary } from "@fluidframework/driver-utils";
import { stringToBuffer, Uint8ArrayToString, unreachableCase } from "@fluidframework/common-utils";
import { getGitType } from "@fluidframework/protocol-base";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { IFileEntry, InstrumentedStorageTokenFetcher } from "@fluidframework/odsp-driver-definitions";
import { IOdspSummaryPayload, IOdspSummaryTree, OdspSummaryTreeEntry, OdspSummaryTreeValue } from "./contracts";
import { IExistingFileInfo, INewFileInfo } from "./odspUtils";
import { ISnapshotContents } from "./odspPublicUtils";
import { EpochTracker } from "./epochTracker";

type CreateNewArgs<T extends INewFileInfo | IExistingFileInfo> = [
    getStorageToken: InstrumentedStorageTokenFetcher,
    fileInfo: T,
    logger: ITelemetryLogger,
    createNewSummary: ISummaryTree | undefined,
    epochTracker: EpochTracker,
    fileEntry: IFileEntry,
    createNewCaching: boolean,
    forceAccessTokenViaAuthorizationHeader: boolean,
    isClpCompliantApp?: boolean,
    enableSingleRequestForShareLinkWithCreate?: boolean,
    enableShareLinkWithCreate?: boolean,  
];

export type CreateNewFileArgs = [
    ...createNewArgs: CreateNewArgs<INewFileInfo>,
    enableSingleRequestForShareLinkWithCreate?: boolean,
    enableShareLinkWithCreate?: boolean,  
];
export type CreateNewContainerOnExistingFile = CreateNewArgs<IExistingFileInfo>;

/**
 * Converts a summary(ISummaryTree) taken in detached container to snapshot tree and blobs
 */
export function convertCreateNewSummaryTreeToTreeAndBlobs(summary: ISummaryTree, treeId: string): ISnapshotContents {
    const protocolSummary = summary.tree[".protocol"] as ISummaryTree;
    const documentAttributes = getDocAttributesFromProtocolSummary(protocolSummary);
    const sequenceNumber = documentAttributes.sequenceNumber;
    const blobs = new Map<string, ArrayBuffer>();
    const snapshotTree = convertCreateNewSummaryTreeToTreeAndBlobsCore(summary, blobs);
    snapshotTree.id = treeId;
    const snapshotTreeValue: ISnapshotContents = {
        snapshotTree,
        blobs,
        ops: [],
        sequenceNumber,
        latestSequenceNumber: sequenceNumber,
    };

    return snapshotTreeValue;
}

function convertCreateNewSummaryTreeToTreeAndBlobsCore(
    summary: ISummaryTree,
    blobs: Map<string, ArrayBuffer>,
) {
    const treeNode: ISnapshotTree = {
        blobs: {},
        trees: {},
        unreferenced: summary.unreferenced,
    };
    const keys = Object.keys(summary.tree);
    for (const key of keys) {
        const summaryObject = summary.tree[key];

        switch (summaryObject.type) {
            case SummaryType.Tree: {
                treeNode.trees[key] =
                    convertCreateNewSummaryTreeToTreeAndBlobsCore(summaryObject, blobs);
                break;
            }
            case SummaryType.Blob: {
                const contentBuffer = typeof summaryObject.content === "string" ?
                    stringToBuffer(summaryObject.content, "utf8") : summaryObject.content;
                const blobId = uuid();
                treeNode.blobs[key] = blobId;
                blobs.set(blobId, contentBuffer);
                break;
            }
            case SummaryType.Handle:
            case SummaryType.Attachment: {
                throw new Error(`No ${summaryObject.type} should be present for detached summary!`);
            }
            default: {
                unreachableCase(summaryObject, `Unknown tree type ${(summaryObject as any).type}`);
            }
        }
    }
    return treeNode;
}

export function convertSummaryIntoContainerSnapshot(createNewSummary: ISummaryTree) {
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
function convertSummaryToSnapshotTreeForCreateNew(summary: ISummaryTree): IOdspSummaryTree {
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

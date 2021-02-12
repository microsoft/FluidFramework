/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Uint8ArrayToString } from "@fluidframework/common-utils";
import { getDocAttributesFromProtocolSummary } from "@fluidframework/driver-utils";
import {
    fetchIncorrectResponse,
    invalidFileNameStatusCode,
    throwOdspNetworkError,
} from "@fluidframework/odsp-doclib-utils";
import { getGitType } from "@fluidframework/protocol-base";
import { SummaryType, ISummaryTree, ISummaryBlob } from "@fluidframework/protocol-definitions";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
    IOdspResolvedUrl,
    ISnapshotTree,
    SnapshotTreeValue,
    SnapshotTreeEntry,
    SnapshotType,
    ICreateFileResponse,
    ISnapshotRequest,
} from "./contracts";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import {
    getWithRetryForTokenRefresh,
    INewFileInfo,
    getOrigin,
} from "./odspUtils";
import { createOdspUrl } from "./createOdspUrl";
import { getApiRoot } from "./odspUrlHelper";
import { TokenFetchOptions } from "./tokenFetch";
import { EpochTracker } from "./epochTracker";
import { OdspDriverUrlResolver } from "./odspDriverUrlResolver";

const isInvalidFileName = (fileName: string): boolean => {
    const invalidCharsRegex = /["*/:<>?\\|]+/g;
    return !!fileName.match(invalidCharsRegex);
};

/**
 * Creates a new Fluid file.
 * Returns resolved url
 */
export async function createNewFluidFile(
    getStorageToken: (options: TokenFetchOptions, name?: string) => Promise<string | null>,
    newFileInfo: INewFileInfo,
    logger: ITelemetryLogger,
    createNewSummary: ISummaryTree,
    epochTracker: EpochTracker,
): Promise<IOdspResolvedUrl> {
    // Check for valid filename before the request to create file is actually made.
    if (isInvalidFileName(newFileInfo.filename)) {
        throwOdspNetworkError("Invalid filename. Please try again.", invalidFileNameStatusCode);
    }

    const filePath = newFileInfo.filePath ? encodeURIComponent(`/${newFileInfo.filePath}`) : "";
    const encodedFilename = encodeURIComponent(newFileInfo.filename);
    const baseUrl =
        `${getApiRoot(getOrigin(newFileInfo.siteUrl))}/drives/${newFileInfo.driveId}/items/root:` +
        `${filePath}/${encodedFilename}`;

    const containerSnapshot = convertSummaryIntoContainerSnapshot(createNewSummary);
    const initialUrl = `${baseUrl}:/opStream/snapshots/snapshot`;

    const itemId = await getWithRetryForTokenRefresh(async (options) => {
        const storageToken = await getStorageToken(options, "CreateNewFile");

        return PerformanceEvent.timedExecAsync(
            logger,
            { eventName: "createNewFile" },
            async (event) => {
                const { url, headers } = getUrlAndHeadersWithAuth(initialUrl, storageToken);
                headers["Content-Type"] = "application/json";

                const fetchResponse = await epochTracker.fetchAndParseAsJSON<ICreateFileResponse>(
                    url,
                    {
                        body: JSON.stringify(containerSnapshot),
                        headers,
                        method: "POST",
                    },
                    "createFile");

                const content = fetchResponse.content;
                if (!content || !content.itemId) {
                    throwOdspNetworkError("Could not parse item from Vroom response", fetchIncorrectResponse);
                }
                event.end({
                    headers: Object.keys(headers).length !== 0 ? true : undefined,
                });
                return content.itemId;
            });
    });

    const odspUrl = createOdspUrl(newFileInfo.siteUrl, newFileInfo.driveId, itemId, "/");
    const resolver = new OdspDriverUrlResolver();
    return resolver.resolve({ url: odspUrl });
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
    const snapshot: ISnapshotRequest = {
        entries: snapshotTree.entries ?? [],
        message: "app",
        sequenceNumber: documentAttributes.sequenceNumber,
        type: SnapshotType.Container,
    };
    return snapshot;
}

/**
 * Converts a summary tree to ODSP tree
 */
export function convertSummaryToSnapshotTreeForCreateNew(summary: ISummaryTree): ISnapshotTree {
    const snapshotTree: ISnapshotTree = {
        type: "tree",
        entries: [],
    };

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

        const entry: SnapshotTreeEntry = {
            path: encodeURIComponent(key),
            type: getGitType(summaryObject),
            value,
        };
        snapshotTree.entries?.push(entry);
    }

    return snapshotTree;
}

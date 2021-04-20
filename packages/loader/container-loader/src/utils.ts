/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import { v4 as uuid } from "uuid";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { fromUtf8ToBase64, bufferToString, performance } from "@fluidframework/common-utils";
import { ISummaryTree, ISnapshotTree, SummaryType } from "@fluidframework/protocol-definitions";
import { canRetryOnError, getRetryDelayFromError } from "@fluidframework/driver-utils";
import { CreateContainerError } from "@fluidframework/container-utils";
import { DeltaManager } from "./deltaManager";

export interface IParsedUrl {
    id: string;
    path: string;
    query: string;
    /**
     * Null means do not use snapshots, undefined means load latest snapshot
     * otherwise it's version ID passed to IDocumentStorageService.getVersions() to figure out what snapshot to use.
     * If needed, can add undefined which is treated by Container.load() as load latest snapshot.
     */
    version: string | null | undefined;
}

export function parseUrl(url: string): IParsedUrl | undefined {
    const parsed = parse(url, true);
    if (typeof parsed.pathname !== "string") {
        throw new Error("Failed to parse pathname");
    }
    const query = parsed.search ?? "";
    const regex = /^\/([^/]*\/[^/]*)(\/?.*)$/;
    const match = regex.exec(parsed.pathname);
    return (match?.length === 3)
        ? { id: match[1], path: match[2], query, version: parsed.query.version as string }
        : undefined;
}

/**
 * Converts summary tree (for upload) to snapshot tree (for download).
 * Summary tree blobs contain contents, but snapshot tree blobs normally
 * contain IDs pointing to storage. This will create 2 blob entries in the
 * snapshot tree for each blob in the summary tree. One will be the regular
 * path pointing to a uniquely generated ID. Then there will be another
 * entry with the path as that uniquely generated ID, and value as the
 * blob contents as a base-64 string.
 * @param summary - summary to convert
 */
function convertSummaryToSnapshotWithEmbeddedBlobContents(
    summary: ISummaryTree,
): ISnapshotTree {
    const treeNode = {
        blobs: {},
        trees: {},
        commits: {},
        id: uuid(),
    };
    const keys = Object.keys(summary.tree);
    for (const key of keys) {
        const summaryObject = summary.tree[key];

        switch (summaryObject.type) {
            case SummaryType.Tree: {
                treeNode.trees[key] = convertSummaryToSnapshotWithEmbeddedBlobContents(summaryObject);
                break;
            }
            case SummaryType.Blob: {
                const blobId = uuid();
                treeNode.blobs[key] = blobId;
                treeNode.blobs[blobId] = typeof summaryObject.content === "string" ?
                    fromUtf8ToBase64(summaryObject.content) :
                    bufferToString(summaryObject.content, "base64");
                break;
            }
            case SummaryType.Handle:
                throw new Error("No handles should be there in summary in detached container!!");
                break;
            default: {
                throw new Error(`Unknown tree type ${summaryObject.type}`);
            }
        }
    }
    return treeNode;
}

/**
 * Combine and convert protocol and app summary tree to format which is readable by container while rehydrating.
 * @param protocolSummaryTree - Protocol Summary Tree
 * @param appSummaryTree - App Summary Tree
 */
export function convertProtocolAndAppSummaryToSnapshotTree(
    protocolSummaryTree: ISummaryTree,
    appSummaryTree: ISummaryTree,
): ISnapshotTree {
    // Shallow copy is fine, since we are doing a deep clone below.
    const combinedSummary: ISummaryTree = {
        type: SummaryType.Tree,
        tree: { ...appSummaryTree.tree },
    };

    combinedSummary.tree[".protocol"] = protocolSummaryTree;

    const snapshotTree = convertSummaryToSnapshotWithEmbeddedBlobContents(combinedSummary);
    return snapshotTree;
}

const delay = async (timeMs: number): Promise<void> =>
    new Promise((resolve) => setTimeout(() => resolve(), timeMs));

export async function runWithRetry<T>(
    api: () => Promise<T>,
    fetchCallName: string,
    deltaManager: Pick<DeltaManager, "emitDelayInfo" | "refreshDelayInfo">,
    logger: ITelemetryLogger,
    shouldRetry?: () => { retry: boolean, error: any | undefined},
): Promise<T> {
    let result: T | undefined;
    let success = false;
    let retryAfterSeconds = 1; // has to be positive!
    let numRetries = 0;
    const startTime = performance.now();
    let lastError: any;
    let id: string | undefined;
    do {
        try {
            result = await api();
            if (id !== undefined) {
                deltaManager.refreshDelayInfo(id);
            }
            success = true;
        } catch (err) {
            if (shouldRetry !== undefined) {
                const res = shouldRetry();
                if (res.retry === false) {
                    if (res.error !== undefined) {
                        throw res.error;
                    }
                    throw err;
                }
            }
            // If it is not retriable, then just throw the error.
            if (!canRetryOnError(err)) {
                logger.sendErrorEvent({
                    eventName: fetchCallName,
                    retry: numRetries,
                    duration: performance.now() - startTime,
                }, err);
                throw err;
            }
            numRetries++;
            lastError = err;
            // If the error is throttling error, then wait for the specified time before retrying.
            // If the waitTime is not specified, then we start with retrying immediately to max of 8s.
            retryAfterSeconds = getRetryDelayFromError(err) ?? Math.min(retryAfterSeconds * 2, 8);
            if (id === undefined) {
                id = uuid();
            }
            deltaManager.emitDelayInfo(id, retryAfterSeconds, CreateContainerError(err));
            await delay(retryAfterSeconds * 1000);
        }
    } while (!success);
    if (numRetries > 0) {
        logger.sendTelemetryEvent({
            eventName: fetchCallName,
            retry: numRetries,
            duration: performance.now() - startTime,
        },
        lastError);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return result!;
}

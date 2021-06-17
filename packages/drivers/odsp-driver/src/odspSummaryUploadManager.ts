/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, Uint8ArrayToString, unreachableCase } from "@fluidframework/common-utils";
import { ISummaryContext } from "@fluidframework/driver-definitions";
import { getGitType } from "@fluidframework/protocol-base";
import * as api from "@fluidframework/protocol-definitions";
import { TokenFetchOptions } from "@fluidframework/odsp-driver-definitions";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
    IOdspSummaryPayload,
    IWriteSummaryResponse,
    IOdspSummaryTree,
    IOdspSummaryTreeBaseEntry,
    OdspSummaryTreeEntry,
    OdspSummaryTreeValue,
} from "./contracts";
import { EpochTracker } from "./epochTracker";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import { getWithRetryForTokenRefresh } from "./odspUtils";

/* eslint-disable max-len */

// Gate that when flipped, instructs to mark unreferenced nodes as such in the summary sent to SPO.
function gatesMarkUnreferencedNodes() {
    try {
        // Leave override for testing purposes
        if (typeof localStorage === "object" && localStorage !== null) {
            if  (localStorage.FluidMarkUnreferencedNodes === "1") {
                return true;
            }
            if  (localStorage.FluidMarkUnreferencedNodes === "0") {
                return false;
            }
        }
    } catch (e) {}

    return true;
}

/**
 * This class manages a summary upload. When it receives a call to upload summary, it converts the summary tree into
 * a snapshot tree and then uploads that to the server.
 */
export class OdspSummaryUploadManager {
    // Last proposed handle of the uploaded app summary.
    private lastSummaryProposalHandle: string | undefined;

    constructor(
        private readonly snapshotUrl: string,
        private readonly getStorageToken: (options: TokenFetchOptions, name: string) => Promise<string | null>,
        private readonly logger: ITelemetryLogger,
        private readonly epochTracker: EpochTracker,
    ) {
    }

    public async writeSummaryTree(tree: api.ISummaryTree, context: ISummaryContext) {
        // If the last proposed handle is not the proposed handle of the acked summary(could happen when the last summary get nacked),
        // then re-initialize the caches with the previous ones else just update the previous caches with the caches from acked summary.
        if (context.proposalHandle !== this.lastSummaryProposalHandle) {
            this.logger.sendTelemetryEvent({
                eventName: "LastSummaryProposedHandleMismatch",
                ackedSummaryProposedHandle: context.proposalHandle,
                lastSummaryProposalHandle: this.lastSummaryProposalHandle,
            });
        }
        const result = await this.writeSummaryTreeCore(context.ackHandle, context.referenceSequenceNumber, tree);
        const id = result ? result.id : undefined;
        if (!result || !id) {
            throw new Error(`Failed to write summary tree`);
        }
        this.lastSummaryProposalHandle = id;
        return id;
    }

    private async writeSummaryTreeCore(
        parentHandle: string | undefined,
        referenceSequenceNumber: number,
        tree: api.ISummaryTree,
    ): Promise<IWriteSummaryResponse> {
        const { snapshotTree, blobs } = await this.convertSummaryToSnapshotTree(
            parentHandle,
            tree,
            ".app",
            "",
        );
        const snapshot: IOdspSummaryPayload = {
            entries: snapshotTree.entries!,
            message: "app",
            sequenceNumber: referenceSequenceNumber,
            type: "channel",
        };

        return getWithRetryForTokenRefresh(async (options) => {
            const storageToken = await this.getStorageToken(options, "WriteSummaryTree");

            const { url, headers } = getUrlAndHeadersWithAuth(`${this.snapshotUrl}/snapshot`, storageToken);
            headers["Content-Type"] = "application/json";

            const postBody = JSON.stringify(snapshot);

            return PerformanceEvent.timedExecAsync(this.logger,
                {
                    eventName: "uploadSummary",
                    attempt: options.refresh ? 2 : 1,
                    hasClaims: !!options.claims,
                    hasTenantId: !!options.tenantId,
                    headers: Object.keys(headers).length !== 0 ? true : undefined,
                    blobs,
                    size: postBody.length,
                },
                async () => {
                    const response = await this.epochTracker.fetchAndParseAsJSON<IWriteSummaryResponse>(
                        url,
                        {
                            body: postBody,
                            headers,
                            method: "POST",
                        },
                        "uploadSummary");
                    return response.content;
                });
        });
    }

    /**
     * Following are the goals of this function.
     *  a.) Converts the summary tree to a snapshot/odsp tree to be uploaded. Always upload full snapshot tree.
     * @param parentHandle - Handle of the last uploaded summary or detach new summary.
     * @param tree - Summary Tree which will be converted to snapshot tree to be uploaded.
     * @param rootNodeName - Root node name of the summary tree.
     * @param path - Current path of node which is getting evaluated.
     * @param markUnreferencedNodes - True if we should mark unreferenced nodes.
     */
    private async convertSummaryToSnapshotTree(
        parentHandle: string | undefined,
        tree: api.ISummaryTree,
        rootNodeName: string,
        path: string = "",
        markUnreferencedNodes: boolean = gatesMarkUnreferencedNodes(),
    ) {
        const snapshotTree: IOdspSummaryTree = {
            type: "tree",
            entries: [] as OdspSummaryTreeEntry[],
        };

        let blobs = 0;
        const keys = Object.keys(tree.tree);
        for (const key of keys) {
            const summaryObject = tree.tree[key];

            let id: string | undefined;
            let value: OdspSummaryTreeValue | undefined;

            // Tracks if an entry is unreferenced. Currently, only tree entries can be marked as unreferenced. If the
            // property is not present, the tree entry is considered referenced. If the property is present and is
            // true (which is the only value it can have), the tree entry is considered unreferenced.
            let unreferenced: true | undefined;
            const currentPath = path === "" ? `${rootNodeName}/${key}` : `${path}/${key}`;
            switch (summaryObject.type) {
                case api.SummaryType.Tree: {
                    const result = await this.convertSummaryToSnapshotTree(
                        parentHandle,
                        summaryObject,
                        rootNodeName,
                        currentPath);
                    value = result.snapshotTree;
                    unreferenced = markUnreferencedNodes ? summaryObject.unreferenced : undefined;
                    blobs += result.blobs;
                    break;
                }
                case api.SummaryType.Blob: {
                    if (typeof summaryObject.content === "string") {
                        value = {
                            type: "blob",
                            content: summaryObject.content,
                            encoding: "utf-8",
                        };
                    } else {
                        value = {
                            type: "blob",
                            content: Uint8ArrayToString(summaryObject.content, "base64"),
                            encoding: "base64",
                        };
                    }
                    blobs++;
                    break;
                }
                case api.SummaryType.Handle: {
                    if (!parentHandle) {
                        throw Error("Parent summary does not exist to reference by handle.");
                    }
                    let handlePath = summaryObject.handle;
                    if (handlePath.length > 0 && !handlePath.startsWith("/")) {
                        handlePath = `/${handlePath}`;
                    }
                    const pathKey = `${rootNodeName}${handlePath}`;
                    id = `${parentHandle}/${pathKey}`;
                    break;
                }
                case api.SummaryType.Attachment: {
                    id = summaryObject.id;
                    break;
                }
                default: {
                    unreachableCase(summaryObject, `Unknown type: ${(summaryObject as any).type}`);
                }
            }

            const baseEntry: IOdspSummaryTreeBaseEntry = {
                path: encodeURIComponent(key),
                type: getGitType(summaryObject),
            };

            let entry: OdspSummaryTreeEntry;

            if (value) {
                assert(id === undefined, 0x0ad /* "Snapshot entry has both a tree value and a referenced id!" */);
                entry = {
                    value,
                    ...baseEntry,
                    unreferenced,
                };
            } else if (id) {
                entry = {
                    ...baseEntry,
                    id,
                };
            } else {
                throw new Error(`Invalid tree entry for ${summaryObject.type}`);
            }

            snapshotTree.entries!.push(entry);
        }

        return { snapshotTree, blobs };
    }
}

/* eslint-enable max-len */

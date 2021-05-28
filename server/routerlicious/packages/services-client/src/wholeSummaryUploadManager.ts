/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, Uint8ArrayToString, unreachableCase } from "@fluidframework/common-utils";
import { getGitType } from "@fluidframework/protocol-base";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import {
    IWholeSummaryPayload,
    IWholeSummaryTree,
    WholeSummaryTreeValue,
    IWholeSummaryTreeBaseEntry,
    WholeSummaryTreeEntry,
} from "./storageContracts";
import { IGitManager, ISummaryUploadManager } from "./storage";

/**
 * Converts summary to snapshot tree and uploads with single snaphot tree payload.
 */
 export class WholeSummaryUploadManager implements ISummaryUploadManager {
    constructor(
        private readonly manager: IGitManager,
    ) {
    }

    public async writeSummaryTree(
        summaryTree: ISummaryTree,
        parentHandle: string | undefined,
    ): Promise<string> {
        const id = await this.writeSummaryTreeCore(parentHandle, summaryTree);
        if (!id) {
            throw new Error(`Failed to write summary tree`);
        }
        return id;
    }

    private async writeSummaryTreeCore(
        parentHandle: string | undefined,
        tree: ISummaryTree,
    ): Promise<string> {
        const snapshotTree = await this.convertSummaryToSnapshotTree(
            parentHandle,
            tree,
            "",
        );
        const snapshotPayload: IWholeSummaryPayload = {
            entries: snapshotTree.entries,
            message: undefined,
            sequenceNumber: undefined,
            type: "channel",
        };

        return this.manager.createSummary(snapshotPayload).then((response) => response.id);
    }
    /**
     * Converts the summary tree to a snapshot tree to be uploaded. Always upload full snapshot tree.
     * @param parentHandle - Handle of the last uploaded summary or detach new summary.
     * @param tree - Summary Tree which will be converted to snapshot tree to be uploaded.
     * @param path - Current path of node which is getting evaluated.
     */
     private async convertSummaryToSnapshotTree(
        parentHandle: string | undefined,
        tree: ISummaryTree,
        path: string = "",
    ): Promise<IWholeSummaryTree> {
        const snapshotTree: IWholeSummaryTree = {
            type: "tree",
            entries: [] as WholeSummaryTreeEntry[],
        };

        const keys = Object.keys(tree.tree);
        for (const key of keys) {
            const summaryObject = tree.tree[key];

            let id: string | undefined;
            let value: WholeSummaryTreeValue | undefined;

            const currentPath = path === "" ? key : `${path}/${key}`;
            switch (summaryObject.type) {
                case SummaryType.Tree: {
                    const result = await this.convertSummaryToSnapshotTree(
                        parentHandle,
                        summaryObject,
                        currentPath);
                    value = result;
                    break;
                }
                case SummaryType.Blob: {
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
                    break;
                }
                case SummaryType.Handle: {
                    if (!parentHandle) {
                        throw Error("Parent summary does not exist to reference by handle.");
                    }
                    id = `${parentHandle}/${summaryObject.handle}`;
                    break;
                }
                case SummaryType.Attachment: {
                    id = summaryObject.id;
                    break;
                }
                default: {
                    unreachableCase(summaryObject, `Unknown type: ${(summaryObject as any).type}`);
                }
            }

            const baseEntry: IWholeSummaryTreeBaseEntry = {
                path: encodeURIComponent(key),
                type: getGitType(summaryObject),
            };

            let entry: WholeSummaryTreeEntry;

            if (value) {
                assert(id === undefined, 0x0ad /* "Snapshot entry has both a tree value and a referenced id!" */);
                entry = {
                    value,
                    ...baseEntry,
                };
            } else if (id) {
                entry = {
                    ...baseEntry,
                    id,
                };
            } else {
                throw new Error(`Invalid tree entry for ${summaryObject.type}`);
            }

            snapshotTree.entries.push(entry);
        }

        return snapshotTree;
    }
}

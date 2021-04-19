/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as git from "@fluidframework/gitresources";
import { assert, Uint8ArrayToString, unreachableCase } from "@fluidframework/common-utils";
import { getGitType } from "@fluidframework/protocol-base";
import {
    ISummaryTree,
    SummaryType,
    ISummarySnapshotPayload,
    SummarySnapshotType,
    ISummarySnapshotTree,
    SummarySnapshotTreeValue,
    ISummarySnapshotTreeBaseEntry,
    SummarySnapshotTreeEntry,
    TreeEntry,
    ITree,
} from "@fluidframework/protocol-definitions";
import { IGitManager, ISummaryUploadManager } from "./storage";

export function buildSnapshotTreeHierarchy(flatTree: git.ITree): ISummarySnapshotTree {
    const snapshotTree: ISummarySnapshotTree = {
        type: "tree",
        entries: [] as SummarySnapshotTreeEntry[],
    };

    const lookup: { [path: string]: ISummarySnapshotTree } = {};
    lookup[""] = snapshotTree;

    for (const entry of flatTree.tree) {
        const lastIndex = entry.path.lastIndexOf("/");
        const entryPathDir = entry.path.slice(0, Math.max(0, lastIndex));
        const entryPathBase = entry.path.slice(lastIndex + 1);

        // The flat output is breadth-first so we can assume we see tree nodes prior to their contents
        const node = lookup[entryPathDir];
        let treeEntry: SummarySnapshotTreeEntry;

        // Add in either the blob or tree
        if (entry.type === "tree") {
            const newTree: ISummarySnapshotTree = {
                type: "tree",
                entries: [] as SummarySnapshotTreeEntry[],
            };
            treeEntry = {
                path: entryPathBase,
                type: entry.type,
                value: newTree,
            };
            lookup[entry.path] = newTree;
        } else if (entry.type === "blob") {
            treeEntry = {
                path: entryPathBase,
                type: entry.type,
                id: entry.sha,
            };
        }

        node.entries.push(treeEntry);
    }

    return snapshotTree;
}

export async function convertTreeToSnapshotTree(tree: ITree): Promise<ISummarySnapshotTree> {
    const snapshotTree: ISummarySnapshotTree = {
        type: "tree",
        entries: [] as SummarySnapshotTreeEntry[],
    };

    for (const treeEntry of tree.entries) {
        let id: string | undefined;
        let value: SummarySnapshotTreeValue | undefined;

        switch (treeEntry.type) {
            case TreeEntry.Tree: {
                const entryAsTree = treeEntry.value;
                const result = await convertTreeToSnapshotTree(entryAsTree);
                value = result;
                break;
            }
            case TreeEntry.Blob: {
                const entryAsBlob = treeEntry.value;
                if (typeof entryAsBlob.contents === "string") {
                    value = {
                        type: "blob",
                        content: entryAsBlob.contents,
                        encoding: "utf-8",
                    };
                } else {
                    value = {
                        type: "blob",
                        content: Uint8ArrayToString(entryAsBlob.contents, "base64"),
                        encoding: "base64",
                    };
                }
                break;
            }
            case TreeEntry.Commit: {
                id = treeEntry.value;
                break;
            }
            default:
                return Promise.reject(new Error("Unknown entry type"));
        }

        const baseEntry: ISummarySnapshotTreeBaseEntry = {
            path: treeEntry.path,
            type: getType(treeEntry.type),
        };

        let entry: SummarySnapshotTreeEntry;

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
            throw new Error(`Invalid tree entry for ${treeEntry.type}`);
        }

        snapshotTree.entries.push(entry);
    }

    return snapshotTree;
}

function getType(treeEntryType: TreeEntry): "blob" | "tree" | "commit" {
    switch (treeEntryType) {
        case TreeEntry.Blob:
            return "blob";
        case TreeEntry.Tree:
            return "tree";
        case TreeEntry.Commit:
                return "commit";
        default:
            throw new Error(`Invalid tree entry type ${treeEntryType}`);
    }
}

/**
 * Converts summary to snapshot tree and uploads with single snaphot tree payload.
 */
 export class SnapshotTreeUploadManager implements ISummaryUploadManager {
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
        const snapshotPayload: ISummarySnapshotPayload = {
            entries: snapshotTree.entries,
            type: SummarySnapshotType.Channel,
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
    ): Promise<ISummarySnapshotTree> {
        const snapshotTree: ISummarySnapshotTree = {
            type: "tree",
            entries: [] as SummarySnapshotTreeEntry[],
        };

        const keys = Object.keys(tree.tree);
        for (const key of keys) {
            const summaryObject = tree.tree[key];

            let id: string | undefined;
            let value: SummarySnapshotTreeValue | undefined;

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

            const baseEntry: ISummarySnapshotTreeBaseEntry = {
                path: encodeURIComponent(key),
                type: getGitType(summaryObject),
            };

            let entry: SummarySnapshotTreeEntry;

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

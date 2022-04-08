/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBlob, ITree } from "@fluidframework/gitresources";
import {
    IWholeFlatSummary,
    IWholeFlatSummaryBlob,
    IWholeFlatSummaryTreeEntry,
} from "@fluidframework/server-services-client";

export class WholeSummaryReadGitManager {
    constructor(
        /**
         * Find the sha for latest version of a document's summary.
         */
        private readonly getLatestVersion: () => Promise<string>,
        /**
         * Read blob from storage.
         */
        private readonly readBlob: (sha: string) => Promise<IBlob>,
        /**
         * Read tree recursively from storage.
         */
        private readonly readTreeRecursive: (sha: string) => Promise<ITree>,
    ) {}

    public async readSummary(sha: string): Promise<IWholeFlatSummary> {
        let versionId = sha;
        if (versionId === "latest") {
            versionId = await this.getLatestVersion();
        }
        const rawTree = await this.readTreeRecursive(versionId);
        const wholeFlatSummaryTreeEntries: IWholeFlatSummaryTreeEntry[] = [];
        const wholeFlatSummaryBlobPs: Promise<IWholeFlatSummaryBlob>[] = [];
        rawTree.tree.forEach((treeEntry) => {
            if (treeEntry.type === "blob") {
                wholeFlatSummaryTreeEntries.push({
                    type: "blob",
                    id: treeEntry.sha,
                    path: treeEntry.path,
                });
                wholeFlatSummaryBlobPs.push(
                    this.getBlob(
                        treeEntry.sha,
                    ),
                );
            } else {
                wholeFlatSummaryTreeEntries.push({
                    type: "tree",
                    path: treeEntry.path,
                });
            }
        });
        const wholeFlatSummaryBlobs = await Promise.all(wholeFlatSummaryBlobPs);
        return {
            id: rawTree.sha,
            trees: [
                {
                    id: rawTree.sha,
                    entries: wholeFlatSummaryTreeEntries,
                    // We don't store sequence numbers in git
                    sequenceNumber: -1,
                },
            ],
            blobs: wholeFlatSummaryBlobs,
        };
    }

    private async getBlob(sha: string): Promise<IWholeFlatSummaryBlob> {
        const blob = await this.readBlob(
            sha,
        );
        return {
            content: blob.content,
            encoding: blob.encoding === "base64" ? "base64" : "utf-8",
            id: blob.sha,
            size: blob.size,
        };
    }
}

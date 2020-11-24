/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
    ISnapshotTree,
    IVersion,
} from "@fluidframework/protocol-definitions";
import { DocumentStorageServiceProxy } from "@fluidframework/driver-utils";
import { debug } from "./debug";

export class PrefetchDocumentStorageService extends DocumentStorageServiceProxy {
    // BlobId -> blob prefetchCache cache
    private readonly prefetchCache = new Map<string, Promise<string>>();
    private prefetchEnabled = true;

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        const p = this.internalStorageService.getSnapshotTree(version);
        if (this.prefetchEnabled) {
            // We don't care if the prefetch succeed
            p.then((tree: ISnapshotTree | null | undefined) => {
                if (tree === null || tree === undefined) { return; }
                this.prefetchTree(tree);
            });
        }
        return p;
    }

    public async readBlob(id: string): Promise<ArrayBufferLike> {
        return this.internalStorageService.readBlob(id);
    }

    public async read(blobId: string): Promise<string> {
        return this.cachedRead(blobId);
    }

    public stopPrefetch() {
        this.prefetchEnabled = false;
        this.prefetchCache.clear();
    }

    private async cachedRead(blobId: string): Promise<string> {
        if (this.prefetchEnabled) {
            const prefetchedBlobP: Promise<string> | undefined = this.prefetchCache.get(blobId);
            if (prefetchedBlobP !== undefined) {
                return prefetchedBlobP;
            }
            const prefetchedBlobPFromStorage = this.internalStorageService.read(blobId);
            this.prefetchCache.set(blobId, prefetchedBlobPFromStorage);
            return prefetchedBlobPFromStorage;
        }
        return this.internalStorageService.read(blobId);
    }

    private prefetchTree(tree: ISnapshotTree) {
        const secondary: string[] = [];
        this.prefetchTreeCore(tree, secondary);

        for (const blob of secondary) {
            // We don't care if the prefetch succeed
            this.cachedRead(blob);
        }
    }

    private prefetchTreeCore(tree: ISnapshotTree, secondary: string[]) {
        for (const blobKey of Object.keys(tree.blobs)) {
            const blob = tree.blobs[blobKey];
            if (blobKey.startsWith(".") || blobKey === "header" || blobKey.startsWith("quorum")) {
                if (blob !== null) {
                    // We don't care if the prefetch succeed
                    this.cachedRead(blob);
                }
            } else if (!blobKey.startsWith("deltas")) {
                if (blob !== null) {
                    secondary.push(blob);
                }
            }
        }

        for (const commit of Object.keys(tree.commits)) {
            this.getVersions(tree.commits[commit], 1)
                .then((moduleCommit) => {
                    this.internalStorageService.getSnapshotTree(moduleCommit[0])
                    .then((snapshotTree: ISnapshotTree | null | undefined) => {
                        if (snapshotTree === null || snapshotTree === undefined) { return; }
                        this.prefetchTree(snapshotTree);
                    });
                })
                .catch((error) => debug("Ignored cached read error", error));
        }

        for (const subTree of Object.keys(tree.trees)) {
            this.prefetchTreeCore(tree.trees[subTree], secondary);
        }
    }
}

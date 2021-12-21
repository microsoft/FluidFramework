/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-null/no-null */
import { LoaderCachingPolicy } from "@fluidframework/driver-definitions";
import {
    ISnapshotTree,
    IVersion,
} from "@fluidframework/protocol-definitions";
import { DocumentStorageServiceProxy } from "./documentStorageServiceProxy";
import { canRetryOnError } from "./network";

export class PrefetchDocumentStorageService extends DocumentStorageServiceProxy {
    // BlobId -> blob prefetchCache cache
    private readonly prefetchCache = new Map<string, Promise<ArrayBufferLike>>();
    private prefetchEnabled = true;

    public get policies() {
        const policies = this.internalStorageService.policies;
        if (policies) {
            return { ...policies, caching: LoaderCachingPolicy.NoCaching };
        }
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        const p = this.internalStorageService.getSnapshotTree(version);
        if (this.prefetchEnabled) {
            // We don't care if the prefetch succeeds
            void p.then((tree: ISnapshotTree | null | undefined) => {
                if (tree === null || tree === undefined) { return; }
                this.prefetchTree(tree);
            });
        }
        return p;
    }

    public async readBlob(blobId: string): Promise<ArrayBufferLike> {
        return this.cachedRead(blobId);
    }
    public stopPrefetch() {
        this.prefetchEnabled = false;
        this.prefetchCache.clear();
    }

    private async cachedRead(blobId: string): Promise<ArrayBufferLike> {
        if (this.prefetchEnabled) {
            const prefetchedBlobP = this.prefetchCache.get(blobId);
            if (prefetchedBlobP !== undefined) {
                return prefetchedBlobP;
            }
            const prefetchedBlobPFromStorage = this.internalStorageService.readBlob(blobId);
            this.prefetchCache.set(blobId, prefetchedBlobPFromStorage.catch((error) => {
                if (canRetryOnError(error)) {
                    this.prefetchCache.delete(blobId);
                }
                throw error;
            }));
            return prefetchedBlobPFromStorage;
        }
        return this.internalStorageService.readBlob(blobId);
    }

    private prefetchTree(tree: ISnapshotTree) {
        const secondary: string[] = [];
        this.prefetchTreeCore(tree, secondary);

        for (const blob of secondary) {
            // We don't care if the prefetch succeeds
            void this.cachedRead(blob);
        }
    }

    private prefetchTreeCore(tree: ISnapshotTree, secondary: string[]) {
        for (const blobKey of Object.keys(tree.blobs)) {
            const blob = tree.blobs[blobKey];
            if (blobKey.startsWith(".") || blobKey === "header" || blobKey.startsWith("quorum")) {
                if (blob !== null) {
                    // We don't care if the prefetch succeeds
                    void this.cachedRead(blob);
                }
            } else if (!blobKey.startsWith("deltas")) {
                if (blob !== null) {
                    secondary.push(blob);
                }
            }
        }

        for (const commit of Object.keys(tree.commits)) {
            // We don't care if the prefetch succeeds
            void this.getVersions(tree.commits[commit], 1)
                .then(async (moduleCommit) => this.getSnapshotTree(moduleCommit[0]));
        }

        for (const subTree of Object.keys(tree.trees)) {
            this.prefetchTreeCore(tree.trees[subTree], secondary);
        }
    }
}

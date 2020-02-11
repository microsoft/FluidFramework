/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    ISnapshotTree,
    IVersion,
} from "@microsoft/fluid-protocol-definitions";
import { DocumentStorageServiceProxy } from "@microsoft/fluid-driver-utils";
import { debug } from "./debug";

export class PrefetchDocumentStorageService extends DocumentStorageServiceProxy {
    // BlobId -> blob prefetchCache cache
    private readonly prefetchCache = new Map<string, Promise<string>>();
    private prefetchEnabled = true;

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        const p = this.internalStorageService.getSnapshotTree(version);
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        if (p && this.prefetchEnabled) {
            // We don't care if the prefetch succeed
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            p.then((tree: ISnapshotTree | null | undefined) => {
                if (!tree) { return; }
                this.prefetchTree(tree);
            });
        }
        return p;
    }

    public async read(blobId: string): Promise<string> {
        return this.cachedRead(blobId);
    }

    public stopPrefetch() {
        this.prefetchEnabled = false;
        this.prefetchCache.clear();
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    private cachedRead(blobId: string): Promise<string> {
        if (this.prefetchEnabled) {
            const prefetchedBlobP: Promise<string> | undefined = this.prefetchCache.get(blobId);
            if (prefetchedBlobP) {
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
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.cachedRead(blob);
        }
    }

    private prefetchTreeCore(tree: ISnapshotTree, secondary: string[]) {
        for (const blobKey of Object.keys(tree.blobs)) {
            const blob = tree.blobs[blobKey];
            if (blobKey.startsWith(".") || blobKey === "header" || blobKey.startsWith("quorum")) {
                if (blob !== null) {
                    // We don't care if the prefetch succeed
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
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
                // eslint-disable-next-line @typescript-eslint/promise-function-async
                .then((moduleCommit) => this.getSnapshotTree(moduleCommit[0]))
                .catch((error) => debug("Ignored cached read error", error));
        }

        for (const subTree of Object.keys(tree.trees)) {
            this.prefetchTreeCore(tree.trees[subTree], secondary);
        }
    }
}

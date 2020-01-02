/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorageService } from "@microsoft/fluid-driver-definitions";
import {
    ICreateBlobResponse,
    ISnapshotTree,
    ISummaryHandle,
    ISummaryTree,
    ITree,
    IVersion,
} from "@microsoft/fluid-protocol-definitions";
import { debug } from "./debug";

export class PrefetchDocumentStorageService implements IDocumentStorageService {
    // BlobId -> blob prefetchCache cache
    private readonly prefetchCache = new Map<string, Promise<string>>();
    private prefetchEnabled = true;

    constructor(private readonly storage: IDocumentStorageService) {
    }

    public get repositoryUrl(): string {
        return this.storage.repositoryUrl;
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        const p = this.storage.getSnapshotTree(version);
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

    public async getVersions(versionId: string | null, count: number): Promise<IVersion[]> {
        return this.storage.getVersions(versionId, count);
    }

    public async read(blobId: string): Promise<string> {
        return this.cachedRead(blobId);
    }

    public async getContent(version: IVersion, path: string): Promise<string> {
        return this.storage.getContent(version, path);
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public write(tree: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        return this.storage.write(tree, parents, message, ref);
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public uploadSummary(commit: ISummaryTree): Promise<ISummaryHandle> {
        return this.storage.uploadSummary(commit);
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        return this.storage.downloadSummary(handle);
    }

    public async createBlob(file: Buffer): Promise<ICreateBlobResponse> {
        return this.storage.createBlob(file);
    }

    public getRawUrl(blobId: string): string {
        return this.storage.getRawUrl(blobId);
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
            const prefetchedBlobPFromStorage = this.storage.read(blobId);
            this.prefetchCache.set(blobId, prefetchedBlobPFromStorage);
            return prefetchedBlobPFromStorage;
        }
        return this.storage.read(blobId);
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

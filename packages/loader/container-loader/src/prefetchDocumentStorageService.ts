/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICreateBlobResponse,
    IDocumentStorageService,
    ISnapshotTree,
    ISummaryCommit,
    ISummaryPackfileHandle,
    ITree,
    IVersion,
} from "@prague/container-definitions";
import { debug } from "./debug";

export class PrefetchDocumentStorageService implements IDocumentStorageService {
    // blobId -> blob prefetchCache cache
    private readonly prefetchCache = new Map<string, Promise<string>>();
    private prefetchEnabled = true;

    constructor(private readonly storage: IDocumentStorageService) {
    }

    public get repositoryUrl(): string {
        return this.storage.repositoryUrl;
    }

    public getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        const p = this.storage.getSnapshotTree(version);
        if (p && this.prefetchEnabled) {
            // We don't care if the prefetch succeed
            // tslint:disable-next-line:no-floating-promises
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

    public write(tree: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        return this.storage.write(tree, parents, message, ref);
    }

    public uploadSummary(commit: ISummaryCommit): Promise<ISummaryPackfileHandle> {
        return this.storage.uploadSummary(commit);
    }

    public downloadSummary(handle: ISummaryPackfileHandle): Promise<ISummaryCommit> {
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
        const secondary = new Array<string>();
        this.prefetchTreeCore(tree, secondary);

        for (const blob of secondary) {
            // We don't care if the prefetch succeed
            // tslint:disable-next-line:no-floating-promises
            this.cachedRead(blob);
        }
    }

    private prefetchTreeCore(tree: ISnapshotTree, secondary: string[]) {
        for (const blobKey of Object.keys(tree.blobs)) {
            const blob = tree.blobs[blobKey];
            if (blobKey[0] === "." || blobKey === "header" || blobKey.indexOf("quorum") === 0) {
                // We don't care if the prefetch succeed
                // tslint:disable-next-line:no-floating-promises
                if (blob !== null) {
                    this.cachedRead(blob);
                }
            } else if (blobKey[0] !== "deltas") {
                if (blob !== null) {
                    secondary.push(blob);
                }
            }
        }

        for (const commit of Object.keys(tree.commits)) {
            this.getVersions(tree.commits[commit], 1)
                .then((moduleCommit) => this.getSnapshotTree(moduleCommit[0]))
                .catch((error) => debug("Ignored cached read error", error));
        }

        for (const subTree of Object.keys(tree.trees)) {
            this.prefetchTreeCore(tree.trees[subTree], secondary);
        }
    }
}

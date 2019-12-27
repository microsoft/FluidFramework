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

/**
 * IDocumentStorageService adapter with pre-cached blobs.
 */
export class BlobCacheStorageService implements IDocumentStorageService {
    public get repositoryUrl(): string {
        return this.storageService.repositoryUrl;
    }

    constructor(private readonly storageService: IDocumentStorageService, private readonly blobs: Map<string, string>) {
    }

    // TODO Will a subcomponent ever need this? Or we can probably restrict the ref to itself
    public async getSnapshotTree(version: IVersion): Promise<ISnapshotTree | null> {
        return this.storageService.getSnapshotTree(version);
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        return this.storageService.getVersions(versionId, count);
    }

    public async getContent(version: IVersion, path: string): Promise<string> {
        return this.storageService.getContent(version, path);
    }

    public async read(id: string): Promise<string> {
        if (this.blobs.has(id)) {
            return this.blobs.get(id)!;
        }

        return this.storageService.read(id);
    }

    public async write(root: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        return this.storageService.write(root, parents, message, ref);
    }

    public async uploadSummary(commit: ISummaryTree): Promise<ISummaryHandle> {
        return this.storageService.uploadSummary(commit);
    }

    public async downloadSummary(commit: ISummaryHandle): Promise<ISummaryTree> {
        return this.storageService.downloadSummary(commit);
    }

    public async createBlob(file: Buffer): Promise<ICreateBlobResponse> {
        return this.storageService.createBlob(file);
    }

    public getRawUrl(blobId: string): string {
        return this.storageService.getRawUrl(blobId);
    }
}

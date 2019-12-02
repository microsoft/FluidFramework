/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorageService, IUploadSummaryTree, SummaryContext } from "@microsoft/fluid-driver-definitions";
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
    public getSnapshotTree(version: IVersion): Promise<ISnapshotTree | null> {
        return this.storageService.getSnapshotTree(version);
    }

    public getVersions(versionId: string, count: number): Promise<IVersion[]> {
        return this.storageService.getVersions(versionId, count);
    }

    public getContent(version: IVersion, path: string): Promise<string> {
        return this.storageService.getContent(version, path);
    }

    public async read(id: string): Promise<string> {
        if (this.blobs.has(id)) {
            return this.blobs.get(id)!;
        }

        return this.storageService.read(id);
    }

    public write(root: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        return this.storageService.write(root, parents, message, ref);
    }

    public uploadSummary(summary: IUploadSummaryTree, context: SummaryContext): Promise<string> {
        return this.storageService.uploadSummary(summary, context);
    }

    public downloadSummary(commit: ISummaryHandle): Promise<ISummaryTree> {
        return this.storageService.downloadSummary(commit);
    }

    public createBlob(file: Buffer): Promise<ICreateBlobResponse> {
        return this.storageService.createBlob(file);
    }

    public getRawUrl(blobId: string): string {
        return this.storageService.getRawUrl(blobId);
    }
}

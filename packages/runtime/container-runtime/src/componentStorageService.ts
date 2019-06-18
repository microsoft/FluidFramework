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

export class ComponentStorageService implements IDocumentStorageService {
    public get repositoryUrl(): string {
        return this.storageService.repositoryUrl;
    }

    constructor(private readonly storageService: IDocumentStorageService, private readonly blobs: Map<string, string>) {
    }

    // TODO Will a subcomponent ever need this? Or we can probably restrict the ref to itself
    public getSnapshotTree(version: IVersion): Promise<ISnapshotTree> {
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
            return this.blobs.get(id);
        }

        return this.storageService.read(id);
    }

    public write(root: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        return this.storageService.write(root, parents, message, ref);
    }

    public uploadSummary(commit: ISummaryCommit): Promise<ISummaryPackfileHandle> {
        return this.storageService.uploadSummary(commit);
    }

    public downloadSummary(commit: ISummaryPackfileHandle): Promise<ISummaryCommit> {
        return this.storageService.downloadSummary(commit);
    }

    public createBlob(file: Buffer): Promise<ICreateBlobResponse> {
        return this.storageService.createBlob(file);
    }

    public getRawUrl(blobId: string): string {
        return this.storageService.getRawUrl(blobId);
    }
}

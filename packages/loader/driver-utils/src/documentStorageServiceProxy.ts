/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentStorageService,
    ISummaryContext,
} from "@fluidframework/driver-definitions";
import {
    ICreateBlobResponse,
    ISnapshotTree,
    ISummaryHandle,
    ISummaryTree,
    ITree,
    IVersion,
} from "@fluidframework/protocol-definitions";

export class DocumentStorageServiceProxy implements IDocumentStorageService {
    public get repositoryUrl(): string {
        return this.internalStorageService.repositoryUrl;
    }

    constructor(protected readonly internalStorageService: IDocumentStorageService) { }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        return this.internalStorageService.getSnapshotTree(version);
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        return this.internalStorageService.getVersions(versionId, count);
    }

    public async read(blobId: string): Promise<string> {
        return this.internalStorageService.read(blobId);
    }

    public async getContent(version: IVersion, path: string): Promise<string> {
        return this.internalStorageService.getContent(version, path);
    }

    public async write(tree: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        return this.internalStorageService.write(tree, parents, message, ref);
    }

    // back-compat: 0.14 uploadSummary
    public async uploadSummary(commit: ISummaryTree): Promise<ISummaryHandle> {
        return this.internalStorageService.uploadSummary(commit);
    }

    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        return this.internalStorageService.uploadSummaryWithContext(summary, context);
    }

    public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        return this.internalStorageService.downloadSummary(handle);
    }

    public async createBlob(file: Buffer): Promise<ICreateBlobResponse> {
        return this.internalStorageService.createBlob(file);
    }

    public getRawUrl(blobId: string): string {
        return this.internalStorageService.getRawUrl(blobId);
    }
}

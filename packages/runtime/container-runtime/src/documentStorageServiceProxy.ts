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
 * A Proxy DocumentStorageService that allows you to flush the read with a blobCache
 * This is specifically used for AttachComponent with Snapshot.
 */
export class DocumentStorageServiceProxy implements IDocumentStorageService {
    public get repositoryUrl(): string {
        return this.storage.repositoryUrl;
    }

    constructor(
        private readonly storage: IDocumentStorageService,
        private readonly blobCache: Map<string, string>,
    ) {
    }

    /* eslint-disable @typescript-eslint/promise-function-async */
    public getSnapshotTree(version?: IVersion): Promise<ISnapshotTree> {
        return this.storage.getSnapshotTree(version);
    }

    public getVersions(versionId: string, count: number): Promise<IVersion[]> {
        return this.storage.getVersions(versionId, count);
    }

    public getContent(version: IVersion, path: string): Promise<string> {
        return this.storage.getContent(version, path);
    }

    public read(id: string): Promise<string> {
        return this.blobCache.has(id)
            ? Promise.resolve(this.blobCache.get(id))
            : this.storage.read(id);
    }

    public write(root: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        return this.storage.write(root, parents, message, ref);
    }

    public createBlob(file: Buffer): Promise<ICreateBlobResponse> {
        return this.storage.createBlob(file);
    }

    public getRawUrl(blobId: string): string {
        return this.storage.getRawUrl(blobId);
    }

    public uploadSummary(commit: ISummaryTree): Promise<ISummaryHandle> {
        return this.storage.uploadSummary(commit);
    }

    public downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        return this.storage.downloadSummary(handle);
    }
    /* eslint-enable @typescript-eslint/promise-function-async */
}

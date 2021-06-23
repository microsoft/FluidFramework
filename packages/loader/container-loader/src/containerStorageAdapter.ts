/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentStorageService,
    IDocumentStorageServicePolicies,
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

/**
 * This class wraps the actual storage and make sure no wrong apis are called according to
 * container attach state.
 */
export class ContainerStorageAdapter implements IDocumentStorageService {
    constructor(
        private readonly storageGetter: () => IDocumentStorageService,
        private readonly blobs: Map<string, ArrayBufferLike>,
    ) {
    }

    public get policies(): IDocumentStorageServicePolicies | undefined {
        // back-compat 0.40 containerRuntime requests policies even in detached container if storage is present
        // and storage is always present in >=0.41.
        try {
            return this.storageGetter().policies;
        } catch(e) {}
        return undefined;
    }

    public get repositoryUrl(): string {
        return this.storageGetter().repositoryUrl;
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        return this.storageGetter().getSnapshotTree(version);
    }

    public async readBlob(id: string): Promise<ArrayBufferLike> {
        const blob = this.blobs.get(id);
        if (blob !== undefined) {
            return blob;
        }
        return this.storageGetter().readBlob(id);
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        return this.storageGetter().getVersions(versionId, count);
    }

    public async write(tree: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        return this.storageGetter().write(tree, parents, message, ref);
    }

    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        return this.storageGetter().uploadSummaryWithContext(summary, context);
    }

    public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        return this.storageGetter().downloadSummary(handle);
    }

    public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
        return this.storageGetter().createBlob(file);
    }
}

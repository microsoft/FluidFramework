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
import { IDisposable } from "@fluidframework/common-definitions";
import { AttachState } from "@fluidframework/container-definitions";

/**
 * This class wraps the actual storage and make sure no wrong apis are called according to
 * container attach state.
 */
export class ContainerStorageAdapter implements IDocumentStorageService, IDisposable {
    private _disposed = false;
    constructor(
        private readonly storageGetter: () => IDocumentStorageService,
        private readonly attachState: () => AttachState,
        private readonly blobs: Map<string, ArrayBufferLike>,
    ) {
    }

    private throwOnNotAttached(name: string) {
        const attachState = this.attachState();
        if (attachState !== AttachState.Attached) {
            throw new Error(`${name} not allowed in Unattached container`);
        }
    }

    public get policies(): IDocumentStorageServicePolicies | undefined {
        return this.storageGetter().policies;
    }

    public get disposed() {return this._disposed;}
    public dispose() {
        this._disposed = true;
    }

    public get repositoryUrl(): string {
        return this.storageGetter().repositoryUrl;
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        this.throwOnNotAttached("getSnapshotTree");
        return this.storageGetter().getSnapshotTree(version);
    }

    public async readBlob(id: string): Promise<ArrayBufferLike> {
        const blob = this.blobs.get(id);
        if (blob !== undefined) {
            return blob;
        }
        // Could not read from storage in unattached container.
        this.throwOnNotAttached("readBlob");
        return this.storageGetter().readBlob(id);
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        this.throwOnNotAttached("getVersions");
        return this.storageGetter().getVersions(versionId, count);
    }

    public async write(tree: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        this.throwOnNotAttached("write");
        return this.storageGetter().write(tree, parents, message, ref);
    }

    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        this.throwOnNotAttached("uploadSummaryWithContext");
        return this.storageGetter().uploadSummaryWithContext(summary, context);
    }

    public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        this.throwOnNotAttached("downloadSummary");
        return this.storageGetter().downloadSummary(handle);
    }

    public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
        this.throwOnNotAttached("createBlob");
        return this.storageGetter().createBlob(file);
    }
}

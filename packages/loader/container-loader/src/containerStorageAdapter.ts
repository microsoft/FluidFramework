/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
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
import { IDetachedBlobStorage } from "./loader";
import { ISnapshotTreeWithBlobContents } from "./utils";

/**
 * This class wraps the actual storage and make sure no wrong apis are called according to
 * container attach state.
 */
export class ContainerStorageAdapter implements IDocumentStorageService {
    private readonly blobContents: { [id: string]: ArrayBufferLike } = {};
    constructor(private readonly storageGetter: () => IDocumentStorageService) {}

    public loadSnapshotForRehydratingContainer(snapshotTree: ISnapshotTreeWithBlobContents) {
        this.getBlobContents(snapshotTree);
    }

    private getBlobContents(snapshotTree: ISnapshotTreeWithBlobContents) {
        for (const [id, value] of Object.entries(snapshotTree.blobsContents)) {
            this.blobContents[id] = value;
        }
        for (const [_, tree] of Object.entries(snapshotTree.trees)) {
            this.getBlobContents(tree);
        }
    }

    public get policies(): IDocumentStorageServicePolicies | undefined {
        // back-compat 0.40 containerRuntime requests policies even in detached container if storage is present
        // and storage is always present in >=0.41.
        try {
            return this.storageGetter().policies;
        } catch (e) {}
        return undefined;
    }

    public get repositoryUrl(): string {
        return this.storageGetter().repositoryUrl;
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        return this.storageGetter().getSnapshotTree(version);
    }

    public async readBlob(id: string): Promise<ArrayBufferLike> {
        const blob = this.blobContents[id];
        if (blob !== undefined) {
            return blob;
        }
        return this.storageGetter().readBlob(id);
    }

    public async getVersions(versionId: string | null, count: number): Promise<IVersion[]> {
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

/**
 * Storage which only supports createBlob() and readBlob(). This is used with IDetachedBlobStorage to support
 * blobs in detached containers.
 */
export class BlobOnlyStorage implements IDocumentStorageService {
    constructor(
        private readonly blobStorage: IDetachedBlobStorage,
        private readonly logger: ITelemetryLogger,
    ) { }

    public async createBlob(content: ArrayBufferLike): Promise<ICreateBlobResponse> {
        return this.blobStorage.createBlob(content);
    }

    public async readBlob(blobId: string): Promise<ArrayBufferLike> {
        return this.blobStorage.readBlob(blobId);
    }

    public get policies(): IDocumentStorageServicePolicies | undefined {
        return this.notCalled();
    }

    public get repositoryUrl(): string {
        return this.notCalled();
    }

    /* eslint-disable @typescript-eslint/unbound-method */
    public getSnapshotTree: () => Promise<ISnapshotTree | null> = this.notCalled;
    public getVersions: () => Promise<IVersion[]> = this.notCalled;
    public write: () => Promise<IVersion> = this.notCalled;
    public uploadSummaryWithContext: () => Promise<string> = this.notCalled;
    public downloadSummary: () => Promise<ISummaryTree> = this.notCalled;
    /* eslint-enable @typescript-eslint/unbound-method */

    private notCalled(): never {
        try {
            // some browsers may not populate stack unless exception is thrown
            throw new Error("BlobOnlyStorage not implemented method used");
        } catch (err) {
            this.logger.sendErrorEvent({ eventName: "BlobOnlyStorageWrongCall" }, err);
            throw err;
        }
    }
}

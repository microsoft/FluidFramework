/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { ISnapshotTreeWithBlobContents } from "@fluidframework/container-definitions";
import {
    FetchSource,
    IDocumentService,
    IDocumentStorageService,
    IDocumentStorageServicePolicies,
    ISummaryContext,
} from "@fluidframework/driver-definitions";
import { UsageError } from "@fluidframework/driver-utils";
import {
    ICreateBlobResponse,
    ISnapshotTree,
    ISummaryHandle,
    ISummaryTree,
    IVersion,
} from "@fluidframework/protocol-definitions";
import { IDetachedBlobStorage } from "./loader";
import { ProtocolTreeStorageService } from "./protocolTreeDocumentStorageService";
import { RetriableDocumentStorageService } from "./retriableDocumentStorageService";

/**
 * This class wraps the actual storage and make sure no wrong apis are called according to
 * container attach state.
 */
export class ContainerStorageAdapter implements IDocumentStorageService, IDisposable {
    private readonly blobContents: { [id: string]: ArrayBufferLike; } = {};
    private _storageService: IDocumentStorageService & Partial<IDisposable>;

    constructor(
        detachedBlobStorage: IDetachedBlobStorage | undefined,
        private readonly logger: ITelemetryLogger,
        private readonly captureProtocolSummary?: () => ISummaryTree,
    ) {
        this._storageService = new BlobOnlyStorage(detachedBlobStorage, logger);
    }

    disposed: boolean = false;
    dispose(error?: Error): void {
        this._storageService?.dispose?.(error);
        this.disposed = true;
    }

    public async connectToService(service: IDocumentService): Promise<void> {
        if (!(this._storageService instanceof BlobOnlyStorage)) {
            return;
        }

        const storageService = await service.connectToStorage();
        const retriableStorage = this._storageService =
            new RetriableDocumentStorageService(
                storageService,
                this.logger);

        if (this.captureProtocolSummary !== undefined) {
            this.logger.sendTelemetryEvent({ eventName: "summarizeProtocolTreeEnabled" });
            this._storageService =
                new ProtocolTreeStorageService(retriableStorage, this.captureProtocolSummary);
        }

        // ensure we did not lose that policy in the process of wrapping
        assert(storageService.policies?.minBlobSize === this._storageService.policies?.minBlobSize,
            0x0e0 /* "lost minBlobSize policy" */);
    }

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
            return this._storageService.policies;
        } catch (e) {}
        return undefined;
    }

    public get repositoryUrl(): string {
        return this._storageService.repositoryUrl;
    }

    public async getSnapshotTree(version?: IVersion, scenarioName?: string): Promise<ISnapshotTree | null> {
        return this._storageService.getSnapshotTree(version, scenarioName);
    }

    public async readBlob(id: string): Promise<ArrayBufferLike> {
        const blob = this.blobContents[id];
        if (blob !== undefined) {
            return blob;
        }
        return this._storageService.readBlob(id);
    }

    public async getVersions(
        versionId: string | null,
        count: number,
        scenarioName?: string,
        fetchSource?: FetchSource,
    ): Promise<IVersion[]> {
        return this._storageService.getVersions(versionId, count, scenarioName, fetchSource);
    }

    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        return this._storageService.uploadSummaryWithContext(summary, context);
    }

    public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        return this._storageService.downloadSummary(handle);
    }

    public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
        return this._storageService.createBlob(file);
    }
}

/**
 * Storage which only supports createBlob() and readBlob(). This is used with IDetachedBlobStorage to support
 * blobs in detached containers.
 */
class BlobOnlyStorage implements IDocumentStorageService {
    constructor(
        private readonly detachedStorage: IDetachedBlobStorage | undefined,
        private readonly logger: ITelemetryLogger,
    ) { }

    public async createBlob(content: ArrayBufferLike): Promise<ICreateBlobResponse> {
        return this.verifyStorage().createBlob(content);
    }

    public async readBlob(blobId: string): Promise<ArrayBufferLike> {
        return this.verifyStorage().readBlob(blobId);
    }

    private verifyStorage(): IDetachedBlobStorage {
        if (this.detachedStorage === undefined) {
            throw new UsageError("Real storage calls not allowed in Unattached container");
        }
        return this.detachedStorage;
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
        this.verifyStorage();
        try {
            // some browsers may not populate stack unless exception is thrown
            throw new Error("BlobOnlyStorage not implemented method used");
        } catch (err) {
            this.logger.sendErrorEvent({ eventName: "BlobOnlyStorageWrongCall" }, err);
            throw err;
        }
    }
}

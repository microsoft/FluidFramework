/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CreateContainerError } from "@fluidframework/container-utils";
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
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { DeltaManager } from "./deltaManager";
import { runWithRetry } from "./utils";

export class RetriableDocumentStorageService implements IDocumentStorageService {
    private disposed = false;
    constructor(
        private readonly internalStorageService: IDocumentStorageService,
        private readonly deltaManager: Pick<DeltaManager, "emitDelayInfo" | "refreshDelayInfo">,
        private readonly logger: ITelemetryLogger,
    ) {
    }

    public get policies(): IDocumentStorageServicePolicies | undefined {
        return this.internalStorageService.policies;
    }

    public dispose() {
        this.disposed = true;
    }

    public get repositoryUrl(): string {
        return this.internalStorageService.repositoryUrl;
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        return runWithRetry(
            async () => this.internalStorageService.getSnapshotTree(version),
            "storage_getSnapshotTree",
            this.deltaManager,
            this.logger,
            () => this.checkStorageDisposed(),
        );
    }

    public async readBlob(id: string): Promise<ArrayBufferLike> {
        return runWithRetry(
            async () => this.internalStorageService.readBlob(id),
            "storage_readBlob",
            this.deltaManager,
            this.logger,
            () => this.checkStorageDisposed(),
        );
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        return runWithRetry(
            async () => this.internalStorageService.getVersions(versionId, count),
            "storage_getVersions",
            this.deltaManager,
            this.logger,
            () => this.checkStorageDisposed(),
        );
    }

    public async write(tree: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        return runWithRetry(
            async () => this.internalStorageService.write(tree, parents, message, ref),
            "storage_write",
            this.deltaManager,
            this.logger,
            () => this.checkStorageDisposed(),
        );
    }

    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        return runWithRetry(
            async () => this.internalStorageService.uploadSummaryWithContext(summary, context),
            "storage_uploadSummaryWithContext",
            this.deltaManager,
            this.logger,
            () => this.checkStorageDisposed(),
        );
    }

    public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        return runWithRetry(
            async () => this.internalStorageService.downloadSummary(handle),
            "storage_downloadSummary",
            this.deltaManager,
            this.logger,
            () => this.checkStorageDisposed(),
        );
    }

    public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
        return runWithRetry(
            async () => this.internalStorageService.createBlob(file),
            "storage_createBlob",
            this.deltaManager,
            this.logger,
            () => this.checkStorageDisposed(),
        );
    }

    private checkStorageDisposed() {
        if (this.disposed) {
            return {
                retry: false,
                error: CreateContainerError("Storage service disposed!!"),
            };
        }
        return { retry: true, error: undefined };
    }
}

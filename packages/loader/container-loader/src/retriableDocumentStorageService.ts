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
import { IDisposable, ITelemetryLogger } from "@fluidframework/common-definitions";
import { runWithRetry } from "@fluidframework/driver-utils";
import { DeltaManager } from "./deltaManager";

export class RetriableDocumentStorageService implements IDocumentStorageService, IDisposable {
    private _disposed = false;
    constructor(
        private readonly internalStorageService: IDocumentStorageService,
        private readonly deltaManager: Pick<DeltaManager, "emitDelayInfo" | "refreshDelayInfo">,
        private readonly logger: ITelemetryLogger,
    ) {
    }

    public get policies(): IDocumentStorageServicePolicies | undefined {
        return this.internalStorageService.policies;
    }
    public get disposed() {return this._disposed;}
    public dispose() {
        this._disposed = true;
    }

    public get repositoryUrl(): string {
        return this.internalStorageService.repositoryUrl;
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        return this.runWithRetry(
            async () => this.internalStorageService.getSnapshotTree(version),
            "storage_getSnapshotTree",
        );
    }

    public async readBlob(id: string): Promise<ArrayBufferLike> {
        return this.runWithRetry(
            async () => this.internalStorageService.readBlob(id),
            "storage_readBlob",
        );
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        return this.runWithRetry(
            async () => this.internalStorageService.getVersions(versionId, count),
            "storage_getVersions",
        );
    }

    public async write(tree: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        return this.runWithRetry(
            async () => this.internalStorageService.write(tree, parents, message, ref),
            "storage_write",
        );
    }

    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        return this.runWithRetry(
            async () => this.internalStorageService.uploadSummaryWithContext(summary, context),
            "storage_uploadSummaryWithContext",
        );
    }

    public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        return this.runWithRetry(
            async () => this.internalStorageService.downloadSummary(handle),
            "storage_downloadSummary",
        );
    }

    public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
        return this.runWithRetry(
            async () => this.internalStorageService.createBlob(file),
            "storage_createBlob",
        );
    }

    private checkStorageDisposed() {
        if (this._disposed) {
            return {
                retry: false,
                error: CreateContainerError("Storage service disposed!!"),
            };
        }
        return { retry: true, error: undefined };
    }

    private async runWithRetry<T>(api: () => Promise<T>, callName: string): Promise<T> {
        return runWithRetry(
            api,
            callName,
            (id: string) => this.deltaManager.refreshDelayInfo(id),
            (id: string, delayMs: number, error: any) =>
                this.deltaManager.emitDelayInfo(id, delayMs, error),
            this.logger,
            () => this.checkStorageDisposed(),
        );
    }
}

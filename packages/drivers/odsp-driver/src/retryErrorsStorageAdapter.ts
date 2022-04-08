/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LoggingError } from "@fluidframework/telemetry-utils";
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
import { runWithRetry } from "./retryUtils";

export class RetryErrorsStorageAdapter implements IDocumentStorageService, IDisposable {
    private _disposed = false;
    constructor(
        private readonly internalStorageService: IDocumentStorageService,
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

    public async getVersions(versionId: string | null, count: number): Promise<IVersion[]> {
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
        // Creation flow with attachment blobs - need to do retries!
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
            // pre-0.58 error message: storageServiceDisposedCannotRetry
            throw new LoggingError("Storage Service is disposed. Cannot retry", { canRetry: false });
        }
    }

    private async runWithRetry<T>(api: () => Promise<T>, callName: string): Promise<T> {
        return runWithRetry(
            api,
            callName,
            this.logger,
            () => this.checkStorageDisposed(),
        );
    }
}

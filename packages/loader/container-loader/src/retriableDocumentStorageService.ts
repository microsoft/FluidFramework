/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { GenericError } from "@fluidframework/container-utils";
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

export class RetriableDocumentStorageService implements IDocumentStorageService, IDisposable {
    private _disposed = false;
    constructor(
        private readonly internalStorageService: IDocumentStorageService,
        private readonly logger: ITelemetryLogger,
    ) {
    }

    public get policies(): IDocumentStorageServicePolicies | undefined {
        return this.internalStorageService.policies;
    }
    public get disposed() { return this._disposed; }
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
        // Not using retry loop here. Couple reasons:
        // 1. If client lost connectivity, then retry loop will result in uploading stale summary
        //    by stale summarizer after connectivity comes back. It will cause failures for this client and for
        //    real (new) summarizer. This problem in particular should be solved in future by supplying abort handle
        //    on all APIs and caller (ContainerRuntime.submitSummary) aborting call on loss of connectivity
        // 2. Similar, if we get 429 with retryAfter = 10 minutes, it's likely not the right call to retry summary
        //    upload in 10 minutes - it's better to keep processing ops and retry later. Though caller needs to take
        //    retryAfter into account!
        // But retry loop is required for creation flow (Container.attach)
        assert((context.referenceSequenceNumber === 0) === (context.ackHandle === undefined),
            0x251 /* "creation summary has to have seq=0 && handle === undefined" */);
        if (context.referenceSequenceNumber !== 0) {
            return this.internalStorageService.uploadSummaryWithContext(summary, context);
        }

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
            throw new GenericError("Storage Service is disposed. Cannot retry", { canRetry: false });
        }
        return undefined;
    }

    private async runWithRetry<T>(api: () => Promise<T>, callName: string): Promise<T> {
        return runWithRetry(
            api,
            callName,
            this.logger,
            {
                retry: () => this.checkStorageDisposed(),
            },
        );
    }
}

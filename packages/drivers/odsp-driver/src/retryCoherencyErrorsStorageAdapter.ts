/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, delay, performance } from "@fluidframework/common-utils";
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
import { canRetryOnError } from "@fluidframework/driver-utils";
import { Odsp409Error } from "./epochTracker";

export class RetryCoherencyErrorsStorageAdapter implements IDocumentStorageService, IDisposable {
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

    private async runWithRetry<T>(api: () => Promise<T>, callName: string): Promise<T> {
        let retryAfter = 1000;
        const start = performance.now();
        for (let retry = 1; ; retry++) {
            if (this._disposed) {
                throw new LoggingError("storageServiceDisposedCannotRetry", { canRetry: false });
            }
            try
            {
                return await api();
            } catch (error) {
                const canRetry = canRetryOnError(error);

                if (error?.[Odsp409Error] !== true) {
                    throw error;
                }

                // SPO itself does number of retries internally before returning 409 to client.
                // That multiplied to 5 suggests need to reconsider current design, as client spends
                // too much time / bandwidth doing the same thing without any progress.
                if (retry === 5) {
                    this.logger.sendErrorEvent({
                        eventName: "CoherencyErrorTooManyRetries",
                        callName,
                        retry,
                        duration: performance.now() - start, // record total wait time.
                    });
                    // Fail hard.
                    error.canRetry = false;
                    throw error;
                }

                assert(canRetry, "can retry");
                await delay(Math.floor(retryAfter));
                retryAfter += retryAfter / 4  * (1 + Math.random());
            }
        }
    }
}

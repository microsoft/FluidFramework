/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CreateContainerError } from "@fluidframework/container-utils";
import {
    IDocumentStorageService,
    IDocumentStorageServicePolicies,
    ISummaryContext,
} from "@fluidframework/driver-definitions";
import { canRetryOnError, getRetryDelayFromError } from "@fluidframework/driver-utils";
import {
    ICreateBlobResponse,
    ISnapshotTree,
    ISummaryHandle,
    ISummaryTree,
    ITree,
    IVersion,
} from "@fluidframework/protocol-definitions";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { performance } from "@fluidframework/common-utils";
import { v4 as uuid } from "uuid";
import { DeltaManager } from "./deltaManager";

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
        return this.runWithRetry(
            async () => this.internalStorageService.getSnapshotTree(version),
            "getSnapshotTree",
        );
    }

    public async readBlob(id: string): Promise<ArrayBufferLike> {
        return this.runWithRetry(async () => this.internalStorageService.readBlob(id), "readBlob");
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        return this.runWithRetry(
            async () => this.internalStorageService.getVersions(versionId, count),
            "getVersions",
        );
    }

    public async write(tree: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        return this.runWithRetry(
            async () => this.internalStorageService.write(tree, parents, message, ref),
            "write",
        );
    }

    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        return this.runWithRetry(
            async () => this.internalStorageService.uploadSummaryWithContext(summary, context),
            "uploadSummaryWithContext",
        );
    }

    public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        return this.runWithRetry(
            async () => this.internalStorageService.downloadSummary(handle),
            "downloadSummary",
        );
    }

    public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
        return this.runWithRetry(async () => this.internalStorageService.createBlob(file), "createBlob");
    }

    private async delay(timeMs: number): Promise<void> {
        return new Promise((resolve) => setTimeout(() => resolve(), timeMs));
    }

    private async runWithRetry<T>(api: () => Promise<T>, fetchCallName: string): Promise<T> {
        let result: T | undefined;
        let success = false;
        let retryAfter = 1; // has to be positive!
        let numRetries = 0;
        const startTime = performance.now();
        let lastError: any;
        let id: string | undefined;
        do {
            try {
                result = await api();
                if (id !== undefined) {
                    this.deltaManager.refreshDelayInfo(id);
                }
                success = true;
            } catch (err) {
                if (this.disposed) {
                    // eslint-disable-next-line @typescript-eslint/no-throw-literal
                    throw CreateContainerError("Storage service disposed!!");
                }
                // If it is not retriable, then just throw the error.
                if (!canRetryOnError(err)) {
                    this.logger.sendErrorEvent({
                        eventName: `Storage_${fetchCallName}`,
                        retry: numRetries,
                        duration: performance.now() - startTime,
                    }, err);
                    throw err;
                }
                numRetries++;
                lastError = err;
                // If the error is throttling error, then wait for the specified time before retrying.
                // If the waitTime is not specified, then we start with retrying immediately to max of 8s.
                retryAfter = getRetryDelayFromError(err) ?? Math.min(retryAfter * 2, 8000);
                if (id === undefined) {
                    id = uuid();
                }
                this.deltaManager.emitDelayInfo(id, retryAfter, CreateContainerError(err));
                await this.delay(retryAfter);
            }
        } while (!success);
        if (numRetries > 0) {
            this.logger.sendTelemetryEvent({
                eventName: `Storage_${fetchCallName}`,
                retry: numRetries,
                duration: performance.now() - startTime,
            },
            lastError);
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return result!;
    }
}

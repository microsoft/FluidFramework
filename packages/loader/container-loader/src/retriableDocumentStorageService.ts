/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { CreateContainerError } from "@fluidframework/container-utils";
import { IDocumentStorageService, ISummaryContext } from "@fluidframework/driver-definitions";
import { canRetryOnError } from "@fluidframework/driver-utils";
import {
    ICreateBlobResponse,
    ISnapshotTree,
    ISummaryHandle,
    ISummaryTree,
    ITree,
    IVersion,
} from "@fluidframework/protocol-definitions";
import { DeltaManager, getRetryDelayFromError } from "./deltaManager";

export class RetriableDocumentStorageService implements IDocumentStorageService {
    private disposed = false;
    constructor(
        private readonly internalStorageService: IDocumentStorageService,
        private readonly deltaManager: Pick<DeltaManager, "emitDelayInfo" | "refreshDelayInfo">,
    ) {
    }

    public dispose() {
        this.disposed = true;
    }

    public get repositoryUrl(): string {
        return this.internalStorageService.repositoryUrl;
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        return this.readWithRetry(async () => this.internalStorageService.getSnapshotTree(version));
    }

    public async read(blobId: string): Promise<string> {
        return this.readWithRetry(async () => this.internalStorageService.read(blobId));
    }

    public async readBlob(id: string): Promise<ArrayBufferLike> {
        return this.readWithRetry(async () => this.internalStorageService.readBlob(id));
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        return this.readWithRetry(async () => this.internalStorageService.getVersions(versionId, count));
    }

    public async write(tree: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        return this.readWithRetry(async () => this.internalStorageService.write(tree, parents, message, ref));
    }

    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        return this.readWithRetry(async () => this.internalStorageService.uploadSummaryWithContext(summary, context));
    }

    public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        return this.readWithRetry(async () => this.internalStorageService.downloadSummary(handle));
    }

    public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
        return this.readWithRetry(async () => this.internalStorageService.createBlob(file));
    }

    private async delay(timeMs: number): Promise<void> {
        return new Promise((resolve) => setTimeout(() => resolve(), timeMs));
    }

    private async readWithRetry<T>(api: () => Promise<T>): Promise<T> {
        let result: T | undefined;
        let success = false;
        let retryAfter = 0;
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
                    throw err;
                }
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return result!;
    }
}

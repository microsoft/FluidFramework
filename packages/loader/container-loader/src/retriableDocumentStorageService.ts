/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CreateContainerError } from "@fluidframework/container-utils";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { canRetryOnError, DocumentStorageServiceProxy } from "@fluidframework/driver-utils";
import { ISnapshotTree, IVersion } from "@fluidframework/protocol-definitions";
import { Container } from "./container";
import { emitThrottlingWarning, getRetryDelayFromError } from "./deltaManager";

export class RetriableDocumentStorageService extends DocumentStorageServiceProxy {
    private disposed = false;
    constructor(
        internalStorageService: IDocumentStorageService,
        private readonly container: Container,
    ) {
        super(internalStorageService);
    }

    public dispose() {
        this.disposed = true;
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

    public async readString(id: string): Promise<string> {
        return this.readWithRetry(async () => this.internalStorageService.readString(id));
    }

    private async delay(timeMs: number): Promise<void> {
        return new Promise((resolve) => setTimeout(() => resolve(), timeMs));
    }

    private async readWithRetry<T>(api: () => Promise<T>, retryLimitSeconds: number = 0): Promise<T> {
        let result: T | undefined;
        let success = false;
        do {
            try {
                result = await api();
                success = true;
            } catch (err) {
                // If it is not retriable, then just throw the error.
                const canRetry = canRetryOnError(err);
                if (!canRetry || this.disposed) {
                    throw err;
                }
                // If the error is throttling error, then wait for the specified time before retrying.
                // If the waitTime is not specified, then we start with retrying immediately to max of 8s.
                const retryAfter = getRetryDelayFromError(err) ?? Math.min(retryLimitSeconds * 2, 8000);
                emitThrottlingWarning(retryAfter, CreateContainerError(err), this.container);
                await this.delay(retryAfter);
            }
        } while (!success);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return result!;
    }
}

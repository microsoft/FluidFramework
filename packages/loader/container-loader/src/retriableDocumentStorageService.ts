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
    private shouldRetry = true;
    constructor(
        internalStorageService: IDocumentStorageService,
        private readonly container: Container,
    ) {
        super(internalStorageService);
    }

    public stopRetry() {
        this.shouldRetry = false;
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

    private async readWithRetry<T>(api: () => Promise<T>, retryLimitSeconds: number = 0): Promise<T> {
        let result: T;
        try {
            result = await api();
        } catch (error) {
            // If it is not retriable, then just throw the error.
            const canRetry = canRetryOnError(error);
            if (!(canRetry && this.shouldRetry)) {
                throw error;
            }
            // If the error is throttling error, then wait for the specified time before retrying.
            // If the waitTime is not specified, then we start with retrying immediately to max of 8s.
            const retryAfter = getRetryDelayFromError(error) ?? Math.min(retryLimitSeconds * 2, 8000);
            emitThrottlingWarning(retryAfter, CreateContainerError(error), this.container);
            result = await new Promise((resolve) => setTimeout(async () => {
                resolve(await this.readWithRetry(api, retryAfter));
            }, retryAfter));
        }
        return result;
    }
}

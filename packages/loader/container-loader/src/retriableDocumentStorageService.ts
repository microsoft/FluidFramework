/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CreateContainerError } from "@fluidframework/container-utils";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { canRetryOnError, DocumentStorageServiceProxy } from "@fluidframework/driver-utils";
import { ISnapshotTree, IVersion } from "@fluidframework/protocol-definitions";
import { Container, RetryFor } from "./container";
import { getRetryDelayFromError } from "./deltaManager";

export class RetriableDocumentStorageService extends DocumentStorageServiceProxy {
    private static callsWaiting: number = 0;
    private static futureTimeTillWait: number = 0;
    private disposed = false;
    constructor(
        internalStorageService: IDocumentStorageService,
        private readonly container: Pick<Container, "emitDelayInfo" | "cancelDelayInfo">,
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

    private async readWithRetry<T>(api: () => Promise<T>): Promise<T> {
        let result: T | undefined;
        let success: boolean | undefined;
        let retryAfter = 0;
        do {
            try {
                result = await api();
                if (success === false) {
                    RetriableDocumentStorageService.callsWaiting -= 1;
                    if (RetriableDocumentStorageService.callsWaiting === 0) {
                        RetriableDocumentStorageService.futureTimeTillWait = 0;
                        this.container.cancelDelayInfo(RetryFor.Storage);
                    }
                }
                success = true;
            } catch (err) {
                // If it is not retriable, then just throw the error.
                const canRetry = canRetryOnError(err);
                if (!canRetry || this.disposed) {
                    throw err;
                }
                if (success === undefined) {
                    // We are going to retry this call.
                    RetriableDocumentStorageService.callsWaiting += 1;
                    success = false;
                }
                // If the error is throttling error, then wait for the specified time before retrying.
                // If the waitTime is not specified, then we start with retrying immediately to max of 8s.
                retryAfter = getRetryDelayFromError(err) ?? Math.min(retryAfter * 2, 8000);
                let waitTime = 0;
                if (RetriableDocumentStorageService.futureTimeTillWait === 0) {
                    waitTime = retryAfter - RetriableDocumentStorageService.futureTimeTillWait;
                    RetriableDocumentStorageService.futureTimeTillWait = Date.now() + waitTime;
                } else {
                    waitTime = Date.now() + retryAfter - RetriableDocumentStorageService.futureTimeTillWait;
                    RetriableDocumentStorageService.futureTimeTillWait += waitTime;
                }
                if (waitTime > 0) {
                    this.container.emitDelayInfo(RetryFor.Storage, waitTime, CreateContainerError(err));
                    RetriableDocumentStorageService.futureTimeTillWait += waitTime;
                }
                await this.delay(retryAfter);
            }
        } while (!success);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return result!;
    }
}

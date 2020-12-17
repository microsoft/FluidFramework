/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { CreateContainerError } from "@fluidframework/container-utils";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { canRetryOnError, DocumentStorageServiceProxy } from "@fluidframework/driver-utils";
import { ISnapshotTree, IVersion } from "@fluidframework/protocol-definitions";
import { DeltaManager, getRetryDelayFromError } from "./deltaManager";

export class RetriableDocumentStorageService extends DocumentStorageServiceProxy {
    private disposed = false;
    constructor(
        internalStorageService: IDocumentStorageService,
        private readonly deltaManager: Pick<DeltaManager, "emitDelayInfo" | "refreshDelayInfo">,
    ) {
        super(internalStorageService);
    }

    public dispose() {
        this.disposed = true;
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        return this.readWithRetry(async () => this.internalStorageService.getSnapshotTree(version));
    }

    /**
     *
     * @deprecated - only here for back compat, will be removed after release
     */
    public async read(blobId: string): Promise<string> {
        return this.readWithRetry(async () => this.internalStorageService.read(blobId) as string);
    }

    public async readBlob(id: string): Promise<ArrayBufferLike> {
        return this.readWithRetry(async () => this.internalStorageService.readBlob(id));
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

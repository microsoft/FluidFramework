/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

interface IBatch {
    currentBatchSize: number;
    batchData: (ISequencedDocumentMessage | undefined)[];
    dirty: boolean;
}

export interface ICache {
  write(batchNumber: string, data: string): Promise<void>;
  read(batchNumber: string): Promise<string | undefined>;
}

export class OpsCache {
  private readonly batches: Map<number, null | IBatch> = new Map();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    startingSequenceNumber: number,
    private readonly cache: ICache,
    private readonly batchSize: number = 100,
    private readonly timerGranularity = 5000,
    private totalOpsToCache = 5000,
  ) {
        /** initial batch is a special case because it will never be full - all ops prior (inclusive) to
         *  startingSequenceNumber are never going to show up (undefined)
         */
        const currentBatchSize = this.getPositionInBatchArray(startingSequenceNumber) + 1; // inclusive
        if (currentBatchSize !== this.batchSize) {
            this.batches.set(this.getBatchNumber(startingSequenceNumber), {
                currentBatchSize,
                batchData : this.initializeNewBatchDataArray(),
                dirty: false,
            });
        }
    }

    public flushOps() {
        for (const [key, value] of this.batches) {
            if (value === null || !value.dirty) {
                continue;
            }
            value.dirty = false;
            this.write(key, value);
        }
    }

    public addOps(ops: ISequencedDocumentMessage[]) {
        if (this.totalOpsToCache <= 0) {
            return;
        }

        for (const op of ops) {
            const batchNumber = this.getBatchNumber(op.sequenceNumber);
            const positionInBatch = this.getPositionInBatchArray(op.sequenceNumber);

            let currentBatch = this.batches.get(batchNumber);

            if (currentBatch === undefined) {
                currentBatch = {
                    currentBatchSize: 1,
                    batchData: this.initializeNewBatchDataArray(),
                    dirty: true,
                };
                currentBatch.batchData[positionInBatch] = op;
                this.batches.set(batchNumber, currentBatch);
            } else if (currentBatch !== null && currentBatch.batchData[positionInBatch] === undefined) {
                currentBatch.batchData[positionInBatch] = op;
                currentBatch.currentBatchSize++;
                currentBatch.dirty = true;
            } else {
                // Either batch was flushed or this op was already there - nothing to do!
                return;
            }

            if (currentBatch.currentBatchSize === this.batchSize) {
                // batch is full, flush to cache
                this.write(batchNumber, currentBatch);
                this.batches.set(batchNumber, null);
            } else {
                this.scheduleTimer();
            }

            this.totalOpsToCache--;
            if (this.totalOpsToCache === 0) {
                this.flushOps();
                this.batches.clear();
                break;
            }
        }
    }

    protected write(batchNumber: number, payload: IBatch) {
        // Errors are caught and logged by PersistedCacheWithErrorHandling that sits
        // in the adapter chain of cache adapters
        this.cache.write(batchNumber.toString(), JSON.stringify(payload.batchData)).catch(() => {
            this.totalOpsToCache = 0;
        });
    }

    protected scheduleTimer() {
        if (!this.timer) {
            this.timer = setTimeout(() => {
                this.timer = undefined;
                this.flushOps();
            }, this.timerGranularity);
        }
    }

    private getBatchNumber(sequenceNumber: number) {
        return Math.floor(sequenceNumber / this.batchSize);
    }

    private getPositionInBatchArray(sequenceNumber: number) {
        return sequenceNumber % this.batchSize;
    }

    private initializeNewBatchDataArray() {
        const tempArray: ISequencedDocumentMessage[] = [];
        tempArray.length = this.batchSize; // fill with empty, undefined elements
        return tempArray;
    }
}

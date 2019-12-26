/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug } from "./debug";
import { IConsumer } from "./kafka";

interface IPartitionRange {
    // Latest offset seen for the partition.
    latestOffset: number;

    // Last checkpointed offset seen for the partition.
    checkpointedOffset: number;
}

/**
 * Class to manage checkpointing of Kafka offsets at different partitions.
 */
export class PartitionManager {
    private checkpointing = false;
    // Stores the processed offset for each partition.
    private partitionMap: { [key: string]: IPartitionRange } = {};
    private lastCheckpointTimestamp: number = 0;

    constructor(
        private readonly consumer: IConsumer,
        private readonly batchSize: number,
        private readonly checkPointInterval: number) {
    }

    /**
     * Controls when to checkpoint.
     */
    public checkPoint() {
        // If already checkpointing allow the operation to complete to trigger another round.
        if (this.checkpointing) {
            return;
        }

        // Base case for when there are not enough messages to trigger checkpointing.
        if (!this.shouldCheckpoint()) {
            return;
        }

        // Finally begin checkpointing the offsets.
        this.checkpointing = true;
        this.checkPointCore()
            .then(() => {
                this.checkpointing = false;
                this.lastCheckpointTimestamp = Date.now();
                // Recursive call to trigger another round.
                this.checkPoint();
            }, (error) => {
                debug(`${this.consumer.groupId}: Error checkpointing kafka offset: ${JSON.stringify(error)}`);
                this.checkpointing = false;
                // Triggering another round.
                this.checkPoint();
            });
    }

    /**
     * Enqueues or updates a partition's offset in the map.
     */
    public update(partition: string, offset: string) {
        if (!(partition in this.partitionMap)) {
            this.partitionMap[partition] = { latestOffset: Number(offset), checkpointedOffset: -1 };
        } else {
            this.partitionMap[partition].latestOffset = Number(offset);
        }
    }
    /**
     * Implements checkpointing kafka offsets.
     */
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    private checkPointCore(): Promise<void> {
        return new Promise<any>((resolve, reject) => {
            const commitDetails = [];
            for (const partition of Object.keys(this.partitionMap)) {
                const currentPartition = this.partitionMap[partition];
                // No update since last checkpoint. Delete the partition.
                if (currentPartition.checkpointedOffset === currentPartition.latestOffset) {
                    delete this.partitionMap[partition];
                    continue;
                }

                // Push to checkpoint queue and update the offset.
                commitDetails.push({
                    offset: currentPartition.latestOffset,
                    partition: Number(partition),
                });
                currentPartition.checkpointedOffset = currentPartition.latestOffset;
            }

            // Commit all checkpoint offsets as a batch.
            this.consumer.commitOffset(commitDetails).then(
                (data) => {
                    resolve({ data: true });
                },
                (error) => {
                    debug(`${this.consumer.groupId}: Error checkpointing kafka offsets: ${error}`);
                    reject(error);
                });
        });
    }

    /**
     * Decides whether to kick off checkpointing or not.
     */
    private shouldCheckpoint(): boolean {
        const partitions = Object.keys(this.partitionMap);

        // No active partitions. So don't need to checkpoint.
        if (partitions.length === 0) {
            return false;
        } else {
            // Checks if threshold time has passed after the last chckpoint.
            if (Date.now() - this.lastCheckpointTimestamp >= this.checkPointInterval) {
                return true;
            }
            // Checks if any of the partitions has more than batchsize messages unprocessed.
            for (const partition of partitions) {
                if (this.partitionMap[partition].latestOffset - this.partitionMap[partition].checkpointedOffset >=
                    this.batchSize) {
                    return true;
                }
            }
            return false;
        }
    }
}

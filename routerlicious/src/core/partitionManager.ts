import * as kafka from "kafka-node";

/**
 * Class to manage checkpointing of Kafka offsets at different partitions.
 */
export class PartitionManager {
    private checkpointing = false;
    // Map of {PartitionNo : [LatestOffset, LastCheckpointedOffset]}
    private partitionMap: { [key: string]: [number , number]} = {};

    constructor(
        private groupId: string,
        private topic: string,
        private consumerOffset: kafka.Offset,
        private batchSize: number) {
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
                // Recursive call to trigger another round.
                this.checkPoint();
            },
            (error) => {
                console.log(`${this.groupId}: Error checkpointing kafka offset: ${JSON.stringify(error)}`);
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
            this.partitionMap[partition] = [Number(offset), -1];
        } else {
            this.partitionMap[partition][0] = Number(offset);
        }
    }
    /**
     * Implements checkpointing kafka offsets.
     */
    private checkPointCore(): Promise<void> {
        return new Promise<any>((resolve, reject) => {
            let commitDetails = [];
            for (let partition of Object.keys(this.partitionMap)) {
                let currentPartition = this.partitionMap[partition];
                // No update since last checkpoint. Delete the partition.
                if (currentPartition[0] === currentPartition[1]) {
                    console.log(`${this.groupId}: Removing partition ${partition}`);
                    delete this.partitionMap[partition];
                    continue;
                }

                // Push to checkpoint queue and update the offset.
                commitDetails.push({ topic: this.topic, partition: Number(partition), offset: currentPartition[0] });
                currentPartition[1] = currentPartition[0];
            }

            // Commit all checkpoint offsets as a batch.
            this.consumerOffset.commit(this.groupId, commitDetails,
                (error, data) => {
                    if (error) {
                        console.error(`${this.groupId}: Error checkpointing kafka offsets: ${error}`);
                        reject(error);
                    } else {
                        console.log(`${this.groupId}: Checkpointed kafka with: ${JSON.stringify(commitDetails)}.
                                     Result: ${JSON.stringify(data)}`);
                        resolve({ data: true });
                    }
            });
        });
    }

    /**
     * Decides whether to kick of checkpointing or not.
     */
    private shouldCheckpoint(): boolean {
        // Checks if any of the partitions has more than batchsize messages unprocessed.
        for (let partition of Object.keys(this.partitionMap)) {
            if (this.partitionMap[partition][0] - this.partitionMap[partition][1] >= this.batchSize) {
                return true;
            }
        }
        return false;
    }
}

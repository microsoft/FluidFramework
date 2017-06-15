import * as utils from "../utils";

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
    private partitionMap: { [key: string]: IPartitionRange} = {};
    private lastCheckpointTimestamp: number = 0;

    constructor(
        private groupId: string,
        private topic: string,
        private kafkaClient: any,
        private consumerUri: string,
        private batchSize: number,
        private checkPointInterval: number) {
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
            },
            (error) => {
                // console.log(`${this.groupId}: Error checkpointing kafka offset: ${JSON.stringify(error)}`);
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
            this.partitionMap[partition] = {latestOffset: Number(offset), checkpointedOffset: -1};
        } else {
            this.partitionMap[partition].latestOffset = Number(offset);
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
                if (currentPartition.checkpointedOffset === currentPartition.latestOffset) {
                    console.log(`${this.groupId}: Removing partition ${partition}`);
                    delete this.partitionMap[partition];
                    continue;
                }

                // Push to checkpoint queue and update the offset.
                commitDetails.push({ offset: currentPartition.latestOffset, partition: Number(partition),
                                     topic: this.topic});
                currentPartition.checkpointedOffset = currentPartition.latestOffset;
            }

            let commitMessage = {offsets: commitDetails};
            // Commit all checkpoint offsets as a batch.
            utils.kafka.commitOffset(this.kafkaClient, this.consumerUri, commitMessage).then(
                (data) => {
                    // tslint:disable-next-line:max-line-length
                    console.log(`${this.groupId}: Checkpointed kafka with: ${JSON.stringify(commitDetails)}. Result: ${JSON.stringify(data)}`);
                    resolve({ data: true });
                },
                (error) => {
                    console.error(`${this.groupId}: Error checkpointing kafka offsets: ${error}`);
                    reject(error);
                }
            );
        });
    }

    /**
     * Decides whether to kick off checkpointing or not.
     */
    private shouldCheckpoint(): boolean {
        let partitions = Object.keys(this.partitionMap);

        // No active partitions. So don't need to checkpoint.
        if (partitions.length === 0) {
            return false;
        } else {
            // Checks if threshold time has passed after the last chckpoint.
            if (Date.now() - this.lastCheckpointTimestamp >= this.checkPointInterval) {
                return true;
            }
            // Checks if any of the partitions has more than batchsize messages unprocessed.
            for (let partition of partitions) {
                if (this.partitionMap[partition].latestOffset - this.partitionMap[partition].checkpointedOffset >=
                    this.batchSize) {
                    return true;
                }
            }
            return false;
        }
    }
}

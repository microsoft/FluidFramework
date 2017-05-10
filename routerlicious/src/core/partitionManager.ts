import * as kafka from "kafka-node";

/**
 * Class to manage checkpointing of Kafka offsets at different partitions.
 */
export class PartitionManager {
    private checkpointing = false;
    // Map of {PartitionNo : [{docId, ProcessedOffset}, [maxOffset, LastProcessedOffset]}
    private partitionMap: { [key: string]: [{ [key: string]: string }, [number, number]] } = {};

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
        if (!this.startCheckpointing()) {
            this.checkpointing = false;
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
            });
    }

    /**
     * Enqueues or updates a document's position in the map.
     */
    public update(objectId: string, partition: string, offset: string) {
        if (!(partition in this.partitionMap)) {
            let newPartition: { [key: string]: string } = {};
            newPartition[objectId] = offset;
            this.partitionMap[partition] = [newPartition, [Number(offset), -1]];
        } else {
            this.partitionMap[partition][0][objectId] = offset;
            this.partitionMap[partition][1][0] = Number(offset);
        }
    }

    /**
     * Implements checkpointing kafka offsets.
     */
    private checkPointCore(): Promise<void> {
        return new Promise<any>((resolve, reject) => {
            let commitDetails = [];
            for (let partition of Object.keys(this.partitionMap)) {
                // Empty partition. Evict the partition.
                if (this.partitionMap[partition][1][0] === this.partitionMap[partition][1][1]) {
                    console.log(`${this.groupId}: Removing partition ${partition}`);
                    delete this.partitionMap[partition];
                    continue;
                }
                // Find out most lagged offset across all document assigned to this partition.
                let mostLaggedOffset = Number.MAX_VALUE;
                let lastCheckpointOffset = this.partitionMap[partition][1][1];
                for (let doc of Object.keys(this.partitionMap[partition][0])) {
                    let docOffset = this.partitionMap[partition][0][doc];
                    // Inactive since last checkpoint. Evict the document from map and continue.
                    if (Number(docOffset) <= lastCheckpointOffset) {
                        console.log(`${this.groupId}: Removing ${doc} from partition ${partition}`);
                        delete this.partitionMap[partition][0][doc];
                        continue;
                    }
                    mostLaggedOffset = Math.min(mostLaggedOffset, Number(docOffset));
                }
                // No document for this partition. Delete the partition.
                if (mostLaggedOffset === Number.MAX_VALUE) {
                    delete this.partitionMap[partition];
                    continue;
                }
                this.partitionMap[partition][1][1] = mostLaggedOffset;
                commitDetails.push({ topic: this.topic, partition: Number(partition), offset: mostLaggedOffset });
            }
            // Commit all checkpoint offsets as a batch.
            this.consumerOffset.commit(this.groupId, commitDetails,
                (error, data) => {
                    if (error) {
                        console.error(`${this.groupId}: Error checkpointing kafka offsets: ${error}`);
                        reject(error);
                    } else {
                        console.log(`${this.groupId}: Checkpointed kafka. ${JSON.stringify(commitDetails)}`);
                        resolve({ data: true });
                    }
            });
        });
    }

    /**
     * Decides whether to kick of checkpointing or not.
     */
    private startCheckpointing(): boolean {
        // Checks if any of the partitions has more than batchsize messages unprocessed.
        for (let partition of Object.keys(this.partitionMap)) {
            if (this.partitionMap[partition][1][0] - this.partitionMap[partition][1][1] >= this.batchSize) {
                return true;
            }
        }
        return false;
    }
}

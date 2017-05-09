import * as kafka from "kafka-node";

/**
 * Class to manage checkpointing of Kafka offsets at different partitions. 
 */
export class PartitionManager {
    private checkpointing = false;
    // Map: PartitionNo : {ObjectId, ProcessedOffset}
    private partitionMap: { [key: string]: { [key: string]: string } } = {};
    private lastCheckpointSnapshot = Number.MAX_VALUE;

    constructor(
        private groupId: string,
        private topic: string,
        private consumerOffset: kafka.Offset,
        private batchSize: number) {
    }

    /**
     * Controls when to checkpoint.
     */
    public checkPoint(rawMessage: any) {
        // If already checkpointing allow the operation to complete to trigger another round.
        if (this.checkpointing) {
            return;
        }

        // Base case for when there are not enough messages to trigger checkpointing.
        if (this.lastCheckpointSnapshot != Number.MAX_VALUE &&
            Number(rawMessage.offset) - this.lastCheckpointSnapshot < this.batchSize) {
            this.checkpointing = false;
            return;
        }

        // Finally begin checkpointing the offsets.
        this.checkpointing = true;
        this.checkPointCore(rawMessage)
            .then(() => {
                this.checkpointing = false;
                // Recursive call to trigger another round.
                this.checkPoint(rawMessage);
            },
            (error) => {
                console.log(`Error checkpointing kafka offset: ${JSON.stringify(error)}`);
            });
    }

    /**
     * Implements checkpointing kafka offsets.
     */
    private checkPointCore(rawMessage: any): Promise<void> {
        return new Promise<any>((resolve, reject) => {
            for (let partition of Object.keys(this.partitionMap)) {
                // Find out most lagged offset across all document assigned to this partition.
                let mostLaggedOffset = Number.MAX_VALUE;
                for (let doc of Object.keys(this.partitionMap[partition])) {
                    mostLaggedOffset = Math.min(mostLaggedOffset, Number(this.partitionMap[partition][doc]));
                }
                // Commit the checkpoint ossfet.
                this.consumerOffset.commit(this.groupId,
                    [{ topic: this.topic, partition: Number(partition), offset: mostLaggedOffset }],
                    (error, data) => {
                        if (error) {
                            console.error(`Error checkpointing kafka offset: ${error}`);
                            reject(error);
                        } else {
                            console.log(`Checkpointed partition ${partition} with offset ${mostLaggedOffset}`);
                        }
                });
                // Keep track of the last offset when you performed a snapshot.
                this.lastCheckpointSnapshot = rawMessage.offset;
            }
            resolve({ data: true });
        });
    }

    /**
     * Enqueues a new document to partition map.
     */    
    public enqueueDoc(objectId: string, partition: string) {
        if (!(partition in this.partitionMap)) {
            let newPartition: { [key: string]: string } = {};
            newPartition[objectId] = "";
            this.partitionMap[partition] = newPartition;
        } else if (!(objectId in this.partitionMap[partition])) {
            this.partitionMap[partition][objectId] = "";
        }
    }

    /**
     * Updates offset of a document in the partition map.
     */    
    public updateOffset(objectId: string, partition: string, offset: string) {
        this.partitionMap[partition][objectId] = offset;
    }

    /**
     * Returns the partition map.
     */    
    public getPartitionMap() {
        return this.partitionMap;
    }

}
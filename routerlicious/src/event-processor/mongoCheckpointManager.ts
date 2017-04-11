import { Collection, Db, MongoClient } from "mongodb";
import { ICheckpointManager } from ".";
import { Checkpoint } from "./checkpoint";

export class MongoCheckpointManager implements ICheckpointManager {
    private client: Promise<Db>;
    private collectionP: Promise<Collection>;

    constructor(
        connectionString: string,
        collectionName: string,
        private entityPath: string,
        private consumerGroup: string) {
        this.client = MongoClient.connect(connectionString);
        this.collectionP = this.client.then((db) => db.collection(collectionName));
    }

    public async createCheckpointStoreIfNotExists(): Promise<void> {
        const collection = await this.collectionP;
        const indexP = collection.createIndex({
                consumerGroup: 1,
                entityPath: 1,
                partitionId: 1,
            },
            { unique: true });

        await indexP;
    }

    public async getCheckpoint(partitionId: string): Promise<Checkpoint> {
        // Need to go and grab the sequence number where we last checkpointed
        const partitions = await this.collectionP;
        const partition = await partitions.findOne({
            consumerGroup: this.consumerGroup,
            entityPath: this.entityPath,
            partitionId,
        });

        return partition
            ? new Checkpoint(partitionId, partition.offset, partition.sequenceNumber)
            : null;
    }

    public async updateCheckpoint(checkpoint: Checkpoint): Promise<void> {
        console.log(`Checkpointing partition${checkpoint.partitionId}@${checkpoint.offset}`);
        const partitions = await this.collectionP;
        const replaceP = partitions.replaceOne(
            {
                consumerGroup: this.consumerGroup,
                entityPath: this.entityPath,
                partitionId: checkpoint.partitionId,
            },
            {
                consumerGroup: this.consumerGroup,
                entityPath: this.entityPath,
                offset: checkpoint.offset,
                partitionId: checkpoint.partitionId,
                sequenceNumber: checkpoint.sequenceNumber,
            },
            {
                upsert: true,
            });

        return replaceP.then(() => Promise.resolve());
    }
}

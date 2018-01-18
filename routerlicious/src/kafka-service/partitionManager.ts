import { Provider } from "nconf";
import * as winston from "winston";
import * as utils from "../utils";
import { IPartitionLambdaFactory } from "./lambdas";
import { Partition } from "./partition";

/**
 * The PartitionManager is responsible for maintaining a list of partitions for the given Kafka topic.
 * It will route incoming messages to the appropriate partition for the messages.
 */
export class PartitionManager {
    private partitions = new Map<number, Partition>();

    constructor(
        private factory: IPartitionLambdaFactory,
        private consumer: utils.kafkaConsumer.IConsumer,
        private config: Provider) {
    }

    public async stop(): Promise<void> {
        // And then wait for each partition to fully process all messages
        const partitionsStoppedP: Array<Promise<void>> = [];
        for (const [, partition] of this.partitions) {
            const stopP = partition.stop();
            partitionsStoppedP.push(stopP);
        }
        await Promise.all(partitionsStoppedP);
    }

    public process(message: utils.kafkaConsumer.IMessage) {
        winston.verbose(`${message.topic}:${message.partition}@${message.offset}`);

        // Create the partition if this is the first message we've seen
        if (!this.partitions.has(message.partition)) {
            const newPartition = new Partition(
                message.partition,
                this.factory,
                this.consumer,
                this.config);

            // TODO need to register for events on the partition - mostly close events which should trigger
            // us to restart

            this.partitions.set(message.partition, newPartition);
        }

        const partition = this.partitions.get(message.partition);
        partition.process(message);
    }
}

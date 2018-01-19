import { EventEmitter } from "events";
import { Provider } from "nconf";
import * as winston from "winston";
import * as utils from "../utils";
import { IPartitionLambdaFactory } from "./lambdas";
import { Partition } from "./partition";

/**
 * The PartitionManager is responsible for maintaining a list of partitions for the given Kafka topic.
 * It will route incoming messages to the appropriate partition for the messages.
 */
export class PartitionManager extends EventEmitter {
    private partitions = new Map<number, Partition>();

    constructor(
        private factory: IPartitionLambdaFactory,
        private consumer: utils.kafkaConsumer.IConsumer,
        private config: Provider) {
        super();
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

            // Listen for close events to know when the partition has stopped processing due to an error or explicit
            // close
            newPartition.on("close", (error, restart) => {
                // For simplicity we will close the entire manager whenever any partition closes. A close primarily
                // indicates that there was an error and this likely affects all partitions being managed (i.e.
                // database write failed, connection issue, etc...).
                // In the case that the restart flag is false and there was an error we will eventually need a way
                // to signify that a partition is 'poisoned'.
                this.emit("close", error, true);
            });

            this.partitions.set(message.partition, newPartition);
        }

        const partition = this.partitions.get(message.partition);
        partition.process(message);
    }
}

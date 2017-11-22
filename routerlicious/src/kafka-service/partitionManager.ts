import { queue } from "async";
import * as winston from "winston";
import * as utils from "../utils";
import { Partition } from "./partition";

export class PartitionManager {
    private q: AsyncQueue<utils.kafkaConsumer.IMessage>;
    private partitions = new Map<number, Partition>();

    constructor() {
        // Create the incoming message queue
        this.q = queue((message: utils.kafkaConsumer.IMessage, callback) => {
            // NOTE processMessage

            // TODO I should be try..catch'ing around this
            this.processMessage(message);

            // TODO check checkpoint

            // Process the next message
            callback();
        }, 1);
    }

    public async stop(): Promise<void> {
        // Drain the queue of any pending operations
        const drainedP = new Promise<void>((resolve, reject) => {
            // If not entries in the queue we can exit immediatley
            if (this.q.length() === 0) {
                winston.info("No pending work exiting early");
                return resolve();
            }

            // Wait until the queue is drained
            winston.info("Waiting for queue to drain");
            this.q.drain = () => {
                winston.info("Drained");
                resolve();
            };
        });

        return drainedP;
    }

    public process(message: utils.kafkaConsumer.IMessage) {
        this.q.push(message);
    }

    /**
     * Returns the latest possible checkpoint information for the partitions. Returns immediately so does
     * not take into account pending work.
     */
    public checkpoint() {
        return null;
    }

    private processMessage(rawMessage: utils.kafkaConsumer.IMessage) {
        winston.info(`${rawMessage.topic}:${rawMessage.partition}@${rawMessage.offset}`);

        if (!this.partitions.has(rawMessage.partition)) {
            const newPartition = new Partition();
            this.partitions.set(rawMessage.partition, newPartition);
        }

        const partition = this.partitions.get(rawMessage.partition);
        partition.process(rawMessage);
    }
}
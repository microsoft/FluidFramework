import { queue } from "async";
import * as winston from "winston";
import * as core from "../core";
import { Deferred } from "../core-utils";
import * as utils from "../utils";
import { Router } from "./router";

class Partition {
    private routers = new Map<string, Router>();

    public process(rawMessage: utils.kafkaConsumer.IMessage) {
        // TODO do I want a topic processor???

        winston.info(`${rawMessage.topic}:${rawMessage.partition}@${rawMessage.offset}`);

        // TODO this type of breakout is pretty specific to us. We might want some kind of topic handler, etc...
        const message = JSON.parse(rawMessage.value) as core.ISequencedOperationMessage;
        if (message.type !== core.SequencedOperationType) {
            return;
        }

        // Create the router if it doesn't exist
        if (!this.routers.has(message.documentId)) {
            const router = new Router(message.documentId /* possibly pass initialization context to router */);
            this.routers.set(message.documentId, router);
        }

        // Route the message
        const router = this.routers.get(message.documentId);
        router.route(message);
    }
}

class PartitionManager {
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

export class KafkaRunner implements utils.IRunner {
    private deferred: Deferred<void>;
    private partitionManager = new PartitionManager();

    constructor(
        private consumer: utils.kafkaConsumer.IConsumer,
        // This wants to be a checkpointing strategy. Check out GOF
        checkpointBatchSize: number,
        checkpointTimeIntervalMsec: number) {
    }

    public start(): Promise<void> {
        this.deferred = new Deferred<void>();

        // Place new Kafka messages into our processing queue
        this.consumer.on("data", (message) => {
            this.partitionManager.process(message);

            // Query checkpointing system to see if we should checkpoint
        });

        // On any Kafka errors immediately stop processing
        this.consumer.on("error", (err) => {
            this.consumer.close();
            this.deferred.reject(err);
        });

        return this.deferred.promise;
    }

    /**
     * Signals to stop the service
     */
    public async stop(): Promise<void> {
        winston.info("Stop requested");

        // stop listening for new updates
        this.consumer.pause();

        // Mark ourselves done once the topic manager has stopped processing
        this.partitionManager.stop().then(
            () => {
                this.deferred.resolve();
            },
            (error) => {
                this.deferred.reject(error);
            });

        return this.deferred.promise;
    }
}

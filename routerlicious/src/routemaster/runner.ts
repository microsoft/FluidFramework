import { AsyncQueue, queue } from "async";
import * as winston from "winston";
import * as core from "../core";
import { Deferred } from "../core-utils";
import * as utils from "../utils";
import { Router } from "./router";

export class RouteMasterRunner implements utils.IRunner {
    private deferred: Deferred<void>;
    private q: AsyncQueue<utils.kafkaConsumer.IMessage>;
    private routers = new Map<string, Router>();

    constructor(
        private producer: utils.kafkaProducer.IProducer,
        private consumer: utils.kafkaConsumer.IConsumer,
        private objectsCollection: core.ICollection<any>,
        private deltas: core.ICollection<any>,
        private checkpointBatchSize: number,
        private checkpointTimeIntervalMsec: number) {
    }

    public start(): Promise<void> {
        const partitionManager = new core.PartitionManager(
            this.consumer,
            this.checkpointBatchSize,
            this.checkpointTimeIntervalMsec,
        );

        this.deferred = new Deferred<void>();
        this.consumer.on("data", (message) => {
            this.q.push(message);
        });

        this.consumer.on("error", (err) => {
            this.consumer.close();
            this.deferred.reject(err);
        });

        winston.info("Waiting for messages");
        this.q = queue((message: any, callback) => {
            this.processMessage(message, partitionManager);

            // Checkpoint periodically
            if (message.offset % this.checkpointBatchSize === 0) {
                partitionManager.checkPoint();
            }

            callback();
        }, 1);

        return this.deferred.promise;
    }

    /**
     * Signals to stop the service
     */
    public stop(): Promise<void> {
        winston.info("Stop requested");

        // stop listening for new updates
        this.consumer.pause();

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

        // Mark ourselves done once the queue is cleaned
        drainedP.then(() => {
            // TODO perform one last checkpoint here
            this.deferred.resolve();
        });

        return this.deferred.promise;
    }

    private processMessage(rawMessage: any, partitionManager: core.PartitionManager) {
        const message = JSON.parse(rawMessage.value.toString("utf8")) as core.ISequencedOperationMessage;
        if (message.type !== core.SequencedOperationType) {
            return;
        }

        // Create the router if it doesn't exist
        if (!this.routers.has(message.documentId)) {
            const router = new Router(message.documentId, this.objectsCollection, this.deltas, this.producer);
            this.routers.set(message.documentId, router);
        }

        // Route the message
        const router = this.routers.get(message.documentId);
        router.route(message);

        partitionManager.update(rawMessage.partition, rawMessage.offset);
    }
}

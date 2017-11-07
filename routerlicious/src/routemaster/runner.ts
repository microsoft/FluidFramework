import { queue } from "async";
import * as winston from "winston";
import * as core from "../core";
import { Deferred } from "../core-utils";
import * as utils from "../utils";

export class RouteMasterRunner implements utils.IRunner {
    private deferred: Deferred<void>;
    private q: AsyncQueue<string>;

    constructor(
        producer: utils.kafkaProducer.IProducer,
        private consumer: utils.kafkaConsumer.IConsumer,
        objectsCollection: core.ICollection<any>,
        groupId: string,
        receiveTopic: string,
        checkpointBatchSize: number,
        checkpointTimeIntervalMsec: number) {
    }

    public start(): Promise<void> {
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
            this.processMessage(message);
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

    private processMessage(message: any) {
        const baseMessage = JSON.parse(message.value.toString("utf8")) as core.ISequencedOperationMessage;
        if (baseMessage.type === core.SequencedOperationType) {
            winston.info(`${baseMessage.documentId}@${baseMessage.operation.sequenceNumber}`);
        }
    }
}

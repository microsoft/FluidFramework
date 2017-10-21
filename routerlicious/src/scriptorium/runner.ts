import { queue } from "async";
import * as winston from "winston";
import * as core from "../core";
import { ThroughputCounter } from "../core-utils";
import * as shared from "../shared";
import * as utils from "../utils";

export class ScriptoriumRunner implements utils.IRunner {
    private deferred = new shared.Deferred<void>();
    private checkpointTimer: any;
    private partitionManager: core.PartitionManager;
    private q: AsyncQueue<string>;
    private ioBatchManager: utils.BatchManager<core.ISequencedOperationMessage>;

    constructor(
        private consumer: utils.kafkaConsumer.IConsumer,
        private collection: core.ICollection<any>,
        private io: core.IPublisher,
        groupId: string,
        topic: string,
        private checkpointBatchSize: number,
        private checkpointTimeIntervalMsec: number) {

        this.partitionManager = new core.PartitionManager(
            groupId,
            topic,
            this.consumer,
            this.checkpointBatchSize,
            this.checkpointTimeIntervalMsec);
    }

    public start(): Promise<void> {
        this.consumer.on("data", (message) => {
            this.q.push(message);
        });

        this.consumer.on("error", (err) => {
            this.deferred.reject(err);
        });

        this.io.on("error", (error) => {
            this.deferred.reject(error);
        });

        const throughput = new ThroughputCounter(winston.info);
        // Mongo inserts don't order promises with respect to each other. To work around this we track the last
        // Mongo insert we've made for each document. And then perform a then on this to maintain causal ordering
        // for any dependent operations (i.e. socket.io writes)
        const lastMongoInsertP: { [documentId: string]: Promise<any> } = {};
        this.ioBatchManager = new utils.BatchManager<core.ISequencedOperationMessage>((documentId, work) => {
            // Initialize the last promise if it doesn't exist
            if (!(documentId in lastMongoInsertP)) {
                lastMongoInsertP[documentId] = Promise.resolve();
            }

            // tslint:disable-next-line:max-line-length
            winston.verbose(`Inserting to mongodb ${documentId}@${work[0].operation.sequenceNumber}:${work.length}`);

            const insertP = this.collection.insertMany(work, false)
                .catch((error) => {
                    // Ignore duplicate key errors since a replay may cause us to attempt to insert a second time
                    if (error.name !== "MongoError" || error.code !== 11000) {
                        return Promise.reject(error);
                    }
                });
            lastMongoInsertP[documentId] = lastMongoInsertP[documentId].then(() => insertP);

            lastMongoInsertP[documentId].then(
                () => {
                    // Route the message to clients
                    // tslint:disable-next-line:max-line-length
                    winston.verbose(`Routing message to clients ${documentId}@${work[0].operation.sequenceNumber}:${work.length}`);

                    // Add traces to each written message.
                    work.map((value) => {
                        if (value.operation.traces !== undefined) {
                            // tslint:disable-next-line:max-line-length
                            value.operation.traces.push( {service: "scriptorium", action: "end", timestamp: Date.now()});
                        }
                    });

                    this.io.to(documentId).emit("op", documentId, work.map((value) => value.operation));
                    throughput.acknolwedge(work.length);
                },
                (error) => {
                    this.deferred.reject(error);
                });
        });

        this.q = queue((message: any, callback) => {
            // NOTE the processing of the below messages must make sure to notify clients of the messages in increasing
            // order. Be aware of promise handling ordering possibly causing out of order messages to be delivered.

            throughput.produce();
            const baseMessage = JSON.parse(message.value.toString("utf8")) as core.IMessage;
            if (baseMessage.type === core.SequencedOperationType) {
                const value = baseMessage as core.ISequencedOperationMessage;

                // Add trace.
                if (value.operation.traces !== undefined) {
                    value.operation.traces.push( {service: "scriptorium", action: "start", timestamp: Date.now()});
                }

                // Batch up work to more efficiently send to socket.io and mongodb
                this.ioBatchManager.add(value.documentId, value);
            }

            // Update partition manager.
            this.partitionManager.update(message.partition, message.offset);

            // Checkpoint to kafka after completing all operations.
            // We should experiment with 'CheckpointBatchSize' here.
            if (message.offset % this.checkpointBatchSize === 0) {
                // Finally call checkpointing.
                this.checkpoint(this.partitionManager).catch((error) => {
                    winston.error(error);
                });
            }
            callback();
        }, 1);

        return this.deferred.promise;
    }

    public stop(): Promise<void> {
        winston.info("Stop requested");
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
        const doneP = drainedP.then(() => this.ioBatchManager.drain());
        doneP.then(() => this.deferred.resolve(), (error) => this.deferred.reject(error));

        return this.deferred.promise;
    }

    private async checkpoint(partitionManager: core.PartitionManager) {
        partitionManager.checkPoint();
        // Clear timer since we just checkpointed.
        if (this.checkpointTimer) {
            clearTimeout(this.checkpointTimer);
        }
        // Set up next cycle.
        this.checkpointTimer = setTimeout(() => {
            this.checkpoint(partitionManager);
        }, this.checkpointTimeIntervalMsec);
    }
}

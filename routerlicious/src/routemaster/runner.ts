import { queue } from "async";
import * as _ from "lodash";
import * as winston from "winston";
import * as api from "../api-core";
import * as core from "../core";
import { Deferred, ThroughputCounter } from "../core-utils";
import * as utils from "../utils";

export class RouteMasterRunner implements utils.IRunner {
    private deferred: Deferred<void>;
    private checkpointTimer: any;
    private q: AsyncQueue<string>;

    constructor(
        private producer: utils.kafkaProducer.IProducer,
        private consumer: utils.kafkaConsumer.IConsumer,
        private objectsCollection: core.ICollection<any>,
        private groupId: string,
        private receiveTopic: string,
        private checkpointBatchSize: number,
        private checkpointTimeIntervalMsec: number) {
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

    private processMessage(
        message: any,
        dispensers: { [key: string]: TakeANumber },
        ticketQueue: {[id: string]: Promise<void> },
        partitionManager: core.PartitionManager,
        producer: utils.kafkaProducer.IProducer,
        objectsCollection: core.ICollection<any>) {

        const baseMessage = JSON.parse(message.value.toString("utf8")) as core.IMessage;
        if (baseMessage.type === core.UpdateReferenceSequenceNumberType ||
            baseMessage.type === core.RawOperationType) {

            // Trace for the message.
            const startTrace: api.ITrace = { service: "deli", action: "start", timestamp: Date.now()};

            const objectMessage = JSON.parse(message.value.toString("utf8")) as core.IObjectMessage;
            const documentId = objectMessage.documentId;

            // Go grab the takeANumber machine for the objectId and mark it as dirty.
            // Store it in the partition map. We need to add an eviction strategy here.
            if (!(documentId in dispensers)) {
                dispensers[documentId] = new TakeANumber(documentId, objectsCollection, producer);
                winston.info(`New document ${documentId}`);
            }
            const dispenser = dispensers[documentId];

            // Either ticket the message or update the sequence number depending on the message type
            const ticketP = dispenser.ticket(message, startTrace);
            ticketQueue[documentId] = ticketP;
        }

        // Update partition manager entry.
        partitionManager.update(message.partition, message.offset);
    }

    private async checkpoint(
        partitionManager: core.PartitionManager,
        dispensers: TakeANumber[],
        pendingTickets: Array<Promise<void>>) {

        // Clear timer since we will checkpoint now.
        if (this.checkpointTimer) {
            clearTimeout(this.checkpointTimer);
        }

        if (pendingTickets.length === 0 && dispensers.length === 0) {
            return;
        }

        // Ticket all messages and empty the queue.
        await Promise.all(pendingTickets);
        pendingTickets = [];

        // Checkpoint to mongo and empty the dispensers.
        let checkpointQueue = dispensers.map((dispenser) => dispenser.checkpoint());
        await Promise.all(checkpointQueue);
        dispensers = [];

        // Finally call kafka checkpointing.
        partitionManager.checkPoint();

        // Set up next cycle.
        this.checkpointTimer = setTimeout(() => {
            this.checkpoint(partitionManager, dispensers, pendingTickets);
        }, this.checkpointTimeIntervalMsec);
    }
}

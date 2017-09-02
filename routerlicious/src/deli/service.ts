import { queue } from "async";
import * as _ from "lodash";
import { Collection } from "mongodb";
import * as core from "../core";
import * as shared from "../shared";
import * as utils from "../utils";
import { logger } from "../utils";
import { TakeANumber } from "./takeANumber";

export class DeliService {
    private checkpointTimer: any;

    constructor(
        private groupId: string,
        private receiveTopic: string,
        private checkpointBatchSize: number,
        private checkpointTimeIntervalMsec: number) {
    }

    public processMessages(
        producer: utils.kafkaProducer.IProdcuer,
        consumer: utils.kafkaConsumer.IConsumer,
        mongoManager: utils.MongoManager,
        objectsCollection: Collection): Promise<void> {

        const deferred = new shared.Deferred<void>();
        const dispensers: { [key: string]: TakeANumber } = {};
        const partitionManager = new core.PartitionManager(
            this.groupId,
            this.receiveTopic,
            consumer,
            this.checkpointBatchSize,
            this.checkpointTimeIntervalMsec,
        );

        consumer.on("data", (message) => {
            q.push(message);
        });

        consumer.on("error", (err) => {
            consumer.close();
            deferred.reject(err);
        });

        let ticketQueue: {[id: string]: Promise<void> } = {};

        const throughput = new utils.ThroughputCounter(logger.info);

        logger.info("Waiting for messages");
        const q = queue((message: any, callback) => {
            throughput.produce();
            this.processMessage(message, dispensers, ticketQueue, partitionManager, producer, objectsCollection);
            throughput.acknolwedge();

            // Periodically checkpoint to mongo and checkpoints offset back to kafka.
            // Ideally there should be a better strategy to figure out when to checkpoint.
            if (message.offset % this.checkpointBatchSize === 0) {
                const pendingDispensers = _.keys(ticketQueue).map((key) => dispensers[key]);
                const pendingTickets = _.values(ticketQueue);
                ticketQueue = {};
                this.checkpoint(partitionManager, pendingDispensers, pendingTickets).catch((error) => {
                    deferred.reject(error);
                });
            }
            callback();
        }, 1);

        // Listen for shutdown signal in order to shutdown gracefully
        process.on("SIGTERM", () => {
            const consumerClosedP = consumer.close();
            const producerClosedP = producer.close();
            const mongoClosedP = mongoManager.close();

            Promise.all([consumerClosedP, producerClosedP, mongoClosedP]).then(
                () => {
                    deferred.resolve();
                },
                (error) => {
                    deferred.reject(error);
                });
        });

        return deferred.promise;
    }

    private processMessage(
        message: any,
        dispensers: { [key: string]: TakeANumber },
        ticketQueue: {[id: string]: Promise<void> },
        partitionManager: core.PartitionManager,
        producer: utils.kafkaProducer.IProdcuer,
        objectsCollection: Collection) {

        const baseMessage = JSON.parse(message.value.toString("utf8")) as core.IMessage;
        if (baseMessage.type === core.UpdateReferenceSequenceNumberType ||
            baseMessage.type === core.RawOperationType) {

            const objectMessage = JSON.parse(message.value.toString("utf8")) as core.IObjectMessage;
            const documentId = objectMessage.documentId;

            // Go grab the takeANumber machine for the objectId and mark it as dirty.
            // Store it in the partition map. We need to add an eviction strategy here.
            if (!(documentId in dispensers)) {
                dispensers[documentId] = new TakeANumber(documentId, objectsCollection, producer);
                logger.info(`New document ${documentId}`);
            }
            const dispenser = dispensers[documentId];

            // Either ticket the message or update the sequence number depending on the message type
            const ticketP = dispenser.ticket(message);
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

import { Collection } from "mongodb";
import * as api from "../api";
import * as core from "../core";
import * as utils from "../utils";

interface IPendingTicket<T> {
    message: any;
    resolve: (value?: T | PromiseLike<T>) => void;
    reject: (value?: T | PromiseLike<T>) => void;
}

const StartingSequenceNumber = 0;

// We expire clients after 5 minutes of no activity
const ClientSequenceTimeout = 5 * 60 * 1000;

interface IClientSequenceNumber {
    clientId: string;
    clientSequenceNumber: number;
    lastUpdate: number;
    referenceSequenceNumber: number;
}

const SequenceNumberComparer: utils.IComparer<IClientSequenceNumber> = {
    compare: (a, b) => a.referenceSequenceNumber - b.referenceSequenceNumber,
    min: {
        clientId: undefined,
        clientSequenceNumber: -1,
        lastUpdate: -1,
        referenceSequenceNumber: -1,
    },
};

const producerRate = new utils.RateCounter();
const ackRate = new utils.RateCounter();
setInterval(() => {
    const produce = 1000 * producerRate.getSamples() / producerRate.elapsed();
    const ack = 1000 * ackRate.getSamples() / ackRate.elapsed();

    console.log(`Produce@ ${produce.toFixed(2)} msg/s - Ack@ ${ack.toFixed(2)} msg/s`);

    producerRate.reset();
    ackRate.reset();
}, 5000);

/**
 * Class to handle distributing sequence numbers to a collaborative object
 */
export class TakeANumber {
    private queue: Array<IPendingTicket<void>> = [];
    private error: any;
    private sequenceNumber: number = undefined;
    private logOffset: number;
    private clientNodeMap: { [key: string]: utils.IHeapNode<IClientSequenceNumber> } = {};
    private clientSeqNumbers = new utils.Heap<IClientSequenceNumber>(SequenceNumberComparer);
    private minimumSequenceNumber;

    constructor(
        private objectId: string,
        private collection: Collection,
        private producer: utils.kafka.Producer) {
        // Lookup the last sequence number stored
        const dbObjectP = this.collection.findOne({ _id: this.objectId });
        dbObjectP.then(
            (dbObject) => {
                if (!dbObject) {
                    throw new Error("Object does not exist");
                }

                // The object exists but we may have yet to update the deli related fields

                if (dbObject.clients) {
                    for (const client of dbObject.clients) {
                        this.upsertClient(
                            client.clientId,
                            client.clientSequenceNumber,
                            client.referenceSequenceNumber,
                            client.lastUpdate);
                    }
                }

                this.sequenceNumber = dbObject.sequenceNumber ? dbObject.sequenceNumber : StartingSequenceNumber;
                this.logOffset = dbObject.logOffset ? dbObject.logOffset : undefined;

                this.resolvePending();
            },
            (error) => {
                this.error = error;
                this.rejectPending(error);
            });
    }

    /**
     * Assigns a number number to the given message at the provided offset
     */
    public ticket(message: any): Promise<void> {
        // If we don't have a base sequence number then we queue the message for ticketing otherwise we can immediately
        // ticket the message
        if (this.sequenceNumber === undefined) {
            if (this.error) {
                return Promise.reject(this.error);
            } else {
                return new Promise<void>((resolve, reject) => {
                    this.queue.push({
                        message,
                        reject,
                        resolve,
                    });
                });
            }
        } else {
            return this.ticketCore(message);
        }
    }

    /**
     * Stores the latest sequence number of the take a number machine
     */
    public checkpoint(): Promise<any> {
        // TOOD I probably want to fail if someone attempts to checkpoint prior to all messages having been
        // ticketed and ackowledged. The clients of this already perform this but extra safety would be good.

        if (this.sequenceNumber === undefined) {
            return Promise.reject("Cannot checkpoint before sequence number is defined");
        }

        // Copy the client offsets for storage in the checkpoint
        const clients: IClientSequenceNumber[] = [];
        // tslint:disable-next-line:forin
        for (const clientId in this.clientNodeMap) {
            clients.push(this.clientNodeMap[clientId].value);
        }

        return this.collection.updateOne(
            {
                _id: this.objectId,
            },
            {
                $set: {
                    _id : this.objectId,
                    clients,
                    logOffset: this.logOffset,
                    sequenceNumber : this.sequenceNumber,
                },
            },
            {
                upsert: true,
            });
    }

    /**
     * Returns the offset of the last sequenced message.
     */
    public getOffset(): number {
        return this.logOffset;
    }

    private ticketCore(rawMessage: any): Promise<void> {
        // In cases where we are reprocessing messages we have already checkpointed exit early
        if (rawMessage.offset < this.logOffset) {
            return Promise.resolve();
        }

        this.logOffset = rawMessage.offset;

        // Update the client's reference sequence number based on the message type
        const objectMessage = JSON.parse(rawMessage.value) as core.IObjectMessage;
        if (objectMessage.type === core.UpdateReferenceSequenceNumberType) {
            const message = objectMessage as core.IUpdateReferenceSequenceNumberMessage;
            this.updateClient(message.clientId, message.timestamp, message.sequenceNumber);

        } else {
            const message = objectMessage as core.IRawOperationMessage;

            // Update and retrieve the minimum sequence number
            this.upsertClient(
                message.clientId,
                message.operation.clientSequenceNumber,
                message.operation.referenceSequenceNumber,
                message.timestamp);
        }

        // Store the previous minimum sequene number we returned and then update it
        const lastMinimumSequenceNumber = this.minimumSequenceNumber;
        this.minimumSequenceNumber = this.getMinimumSequenceNumber(objectMessage.timestamp);

        // If the client updating there reference sequence number did not result in a change to the minimum
        // sequence number we can return early since no output packet will be generated.
        if ((objectMessage.type === core.UpdateReferenceSequenceNumberType) &&
            (lastMinimumSequenceNumber === this.minimumSequenceNumber)) {
            return Promise.resolve();
        }

        // Increment and grab the next sequence number
        const sequenceNumber = this.revSequenceNumber();

        // And now craft the output message
        let outputMessage: api.IBase;
        if (objectMessage.type === core.UpdateReferenceSequenceNumberType) {
            const minimumSequenceNumberMessage: api.IBase = {
                minimumSequenceNumber: this.minimumSequenceNumber,
                sequenceNumber,
                type: api.MinimumSequenceNumberUpdateType,
            };

            outputMessage = minimumSequenceNumberMessage;
        } else {
            const message = objectMessage as core.IRawOperationMessage;
            const operation = message.operation;
            const sequencedOperation: api.ISequencedMessage = {
                clientId: message.clientId,
                clientSequenceNumber: operation.clientSequenceNumber,
                minimumSequenceNumber: this.minimumSequenceNumber,
                op: operation.op,
                referenceSequenceNumber: operation.referenceSequenceNumber,
                sequenceNumber,
                type: api.OperationType,
                userId: message.userId,
            };
            outputMessage = sequencedOperation;
        }

        // tslint:disable-next-line:max-line-length
        // console.log(`Assigning ticket ${objectMessage.objectId}@${sequenceNumber}:${this.minimumSequenceNumber} at topic@${this.logOffset}`);

        const sequencedMessage: core.ISequencedOperationMessage = {
            objectId: objectMessage.objectId,
            operation: outputMessage,
            type: core.SequencedOperationType,
        };

        // Otherwise send the message to the event hub
        producerRate.increment(1);
        return this.producer.send(JSON.stringify(sequencedMessage), sequencedMessage.objectId)
            .then((result) => {
                ackRate.increment(1);
                return result;
            });
    }

    /**
     * Returns a new sequence number
     */
    private revSequenceNumber(): number {
        return ++this.sequenceNumber;
    }

    /**
     * Resolves all pending tickets
     */
    private resolvePending() {
        for (const ticket of this.queue) {
            this.resolveTicket(ticket);
        }

        this.queue = [];
    }

    /**
     * Tickets and then resolves the stored promise for the given pending ticket
     */
    private resolveTicket(ticket: IPendingTicket<void>) {
        const ticketP = this.ticketCore(ticket.message);
        ticketP.then(
            () => {
                ticket.resolve();
            },
            (error) => {
                ticket.reject(error);
            });
    }

    /**
     * Rejects any pending messages in the ticketing queue
     */
    private rejectPending(error: any) {
        for (const pendingTicket of this.queue) {
            pendingTicket.reject(error);
        }

        this.queue = [];
    }

    private upsertClient(
        clientId: string,
        clientSequenceNumber: number,
        referenceSequenceNumber: number,
        timestamp: number) {

        // Add the client ID to our map if this is the first time we've seen it
        if (!(clientId in this.clientNodeMap)) {
            const newNode = this.clientSeqNumbers.add({
                clientId,
                clientSequenceNumber,
                lastUpdate: timestamp,
                referenceSequenceNumber,
            });
            this.clientNodeMap[clientId] = newNode;
        }

        // And then update its values
        this.updateClient(clientId, timestamp, referenceSequenceNumber, clientSequenceNumber);
    }

    /**
     * Updates the sequence number of the specified client
     */
    private updateClient(
        clientId: string,
        timestamp: number,
        referenceSequenceNumber: number,
        clientSequenceNumber?: number) {

        // Lookup the node and then update its value based on the message
        const heapNode = this.clientNodeMap[clientId];
        if (heapNode) {
            heapNode.value.referenceSequenceNumber = referenceSequenceNumber;
            heapNode.value.lastUpdate = timestamp;
            if (clientSequenceNumber !== undefined) {
                heapNode.value.clientSequenceNumber = clientSequenceNumber;
            }
            this.clientSeqNumbers.update(heapNode);
        }
    }

    /**
     * Retrieves the minimum sequence number. A timestamp is provided to expire old clients.
     */
    private getMinimumSequenceNumber(timestamp: number): number {
        while (this.clientSeqNumbers.count() > 0) {
            const client = this.clientSeqNumbers.peek();
            if (timestamp - client.value.lastUpdate < ClientSequenceTimeout) {
                return client.value.referenceSequenceNumber;
            }

            // console.log(`Expiring ${client.value.clientId}`);
            this.clientSeqNumbers.get();
            delete this.clientNodeMap[client.value.clientId];
        }

        return this.sequenceNumber;
    }
}

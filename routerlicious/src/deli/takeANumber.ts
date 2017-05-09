// import { Sender } from "azure-event-hubs";
import * as kafka from "kafka-node";
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

/**
 * Class to handle distributing sequence numbers to a collaborative object
 */
export class TakeANumber {
    private queue: Array<IPendingTicket<void>> = [];
    private error: any;
    private sequenceNumber: number = undefined;
    private offset: string;
    private clientNodeMap: { [key: string]: utils.IHeapNode<IClientSequenceNumber> } = {};
    private clientSeqNumbers = new utils.Heap<IClientSequenceNumber>(SequenceNumberComparer);

    constructor(
        private objectId: string,
        private collection: Collection,
        private producer: kafka.Producer,
        private topic: string) {
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
                this.offset = dbObject.offset ? dbObject.offset : undefined;

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
        console.log(JSON.stringify(clients));

        return this.collection.updateOne(
            {
                _id: this.objectId,
            },
            {
                $set: {
                    _id : this.objectId,
                    clients,
                    offset: this.offset,
                    sequenceNumber : this.sequenceNumber,
                },
            },
            {
                upsert: true,
            });
    }

    private ticketCore(rawMessage: any): Promise<void> {
        // In cases where we are reprocessing messages we have already checkpointed exit early
        if (rawMessage.offset < this.offset) {
            return Promise.resolve();
        }

        const message = JSON.parse(rawMessage.value) as core.IRawOperationMessage;
        const operation = message.operation;

        // Increment and grab the next sequence number as well as store the event hub offset mapping to it
        const sequenceNumber = ++this.sequenceNumber;
        this.offset = rawMessage.offset;

        // Update and retrieve the minimum sequence number
        this.upsertClient(
            message.clientId,
            message.operation.clientSequenceNumber,
            message.operation.referenceSequenceNumber,
            message.timestamp);

        // The min value in the heap represents the minimum sequence number
        const minimumSequenceNumber = this.getMinimumSequenceNumber(message.timestamp);

        console.log(`Assigning ticket ${message.objectId}@${sequenceNumber} at topic@${this.offset}`);
        const sequencedOperation: api.ISequencedMessage = {
            clientId: message.clientId,
            clientSequenceNumber: operation.clientSequenceNumber,
            minimumSequenceNumber,
            op: operation.op,
            referenceSequenceNumber: operation.referenceSequenceNumber,
            sequenceNumber,
            userId: message.userId,
        };
        const sequencedMessage: core.ISequencedOperationMessage = {
            objectId: message.objectId,
            operation: sequencedOperation,
        };

        // Serialize the sequenced message to the event hub
        const payloads = [{
            key: sequencedMessage.objectId,
            messages: [JSON.stringify(sequencedMessage)],
            topic: this.topic,
        }];
        return new Promise<any>((resolve, reject) => {
            this.producer.send(payloads, (error, data) => {
                if (error) {
                    return reject(error);
                }

                console.log(data);
                resolve({ data: true });
            });
        });
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

        // Lookup the node and then update its value based on the message
        const heapNode = this.clientNodeMap[clientId];
        heapNode.value.referenceSequenceNumber = referenceSequenceNumber;
        heapNode.value.clientSequenceNumber = clientSequenceNumber;
        heapNode.value.lastUpdate = timestamp;
        this.clientSeqNumbers.update(heapNode);
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

            console.log(`Expiring ${client.value.clientId}`);
            this.clientSeqNumbers.get();
            delete this.clientNodeMap[client.value.clientId];
        }

        return this.sequenceNumber;
    }
}

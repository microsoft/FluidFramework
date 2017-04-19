// import { Sender } from "azure-event-hubs";
import * as kafka from "kafka-node";
import { Collection } from "mongodb";
import * as socketStorage from "../socket-storage";

interface IPendingTicket<T> {
    message: any;
    resolve: (value?: T | PromiseLike<T>) => void;
    reject: (value?: T | PromiseLike<T>) => void;
}

const StartingSequenceNumber = 0;

/**
 * Class to handle distributing sequence numbers to a collaborative object
 */
export class TakeANumber {
    private queue: Array<IPendingTicket<void>> = [];
    private error: any;
    private sequenceNumber: number = undefined;
    private offset: string;

    constructor(
        private objectId: string,
        private collection: Collection,
        private producer: kafka.Producer,
        private topic: string) {
        // Lookup the last sequence number stored
        const dbObjectP = this.collection.findOne({ _id: this.objectId });
        dbObjectP.then(
            (dbObject) => {
                if (dbObject) {
                    console.log(`Existing object ${this.objectId}@${dbObject.sequenceNumber}`);
                } else {
                    console.log(`New object`);
                }

                this.sequenceNumber = dbObject ? dbObject.sequenceNumber : StartingSequenceNumber;
                this.offset = dbObject ? dbObject.offset : undefined;
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

        return this.collection.updateOne(
            {
                _id: this.objectId,
            },
            {
                $set: {
                    _id : this.objectId,
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

        const message = JSON.parse(rawMessage.value) as socketStorage.ISubmitOpMessage;

        // Increment and grab the next sequence number as well as store the event hub offset mapping to it
        const sequenceNumber = ++this.sequenceNumber;
        this.offset = rawMessage.offset;

        // tslint:disable-next-line
        console.log(`Assigning ticket ${message.objectId}@${sequenceNumber} at topic@${this.offset}`);

        const routedMessage: socketStorage.IRoutedOpMessage = {
            clientId: message.clientId,
            objectId: message.objectId,
            op: message.op,
            sequenceNumber,
        };

        // Serialize the sequenced message to the event hub
        const payloads = [{
            key: routedMessage.objectId,
            messages: [JSON.stringify(routedMessage)],
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
}

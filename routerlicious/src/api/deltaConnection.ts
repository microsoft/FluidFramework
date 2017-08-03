import { EventEmitter } from "events";
import { IBase, IMessage, OperationType } from "./protocol";
import { IDeltaConnection, IDocumentDeltaConnection } from "./storage";

export class DeltaConnection implements IDeltaConnection {
    protected events = new EventEmitter();

    // Flag indicating whether or not we need to udpate the reference sequence number
    private updateHasBeenRequested = false;
    private updateSequenceNumberTimer: any;

    // Flag indicating whether the client has only received messages
    private readonly = true;

    // The last sequence number we received from the server
    private referenceSequenceNumber;

    constructor(public objectId: string, private connection: IDocumentDeltaConnection) {
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public emit(message: IBase) {
        this.referenceSequenceNumber = message.object.sequenceNumber;
        this.events.emit("op", message);

        // We will queue a message to update our reference sequence number upon receiving a server operation. This
        // allows the server to know our true reference sequence number and be able to correctly update the minimum
        // sequence number (MSN). We don't ackowledge other message types similarly (like a min sequence number update)
        // to avoid ackowledgement cycles (i.e. ack the MSN update, which updates the MSN, then ack the update, etc...).
        if (message.type === OperationType) {
            this.updateSequenceNumber();
        }
    }

    /**
     * Send new messages to the server
     */
    public submitOp(message: IMessage): Promise<void> {
        this.readonly = false;
        this.stopSequenceNumberUpdate();

        // TODO this probably needs to be appended with other stuff

        return this.connection.submitOp(message);
    }

    /**
     * Acks the server to update the reference sequence number
     */
    private updateSequenceNumber() {
        // Exit early for readonly clients. They don't take part in the minimum sequence number calculation.
        if (this.readonly) {
            return;
        }

        // If an update has already been requeested then mark this fact. We will wait until no updates have
        // been requested before sending the updated sequence number.
        if (this.updateSequenceNumberTimer) {
            this.updateHasBeenRequested = true;
            return;
        }

        // Clear an update in 100 ms
        this.updateSequenceNumberTimer = setTimeout(() => {
            this.updateSequenceNumberTimer = undefined;

            // If a second update wasn't requested then send an update message. Otherwise defer this until we
            // stop processing new messages.
            if (!this.updateHasBeenRequested) {
                // TODO this probably needs the object its updating the ref seq # for
                this.connection.updateReferenceSequenceNumber(this.objectId, this.referenceSequenceNumber);
            } else {
                this.updateHasBeenRequested = false;
                this.updateSequenceNumber();
            }
        }, 100);
    }

    private stopSequenceNumberUpdate() {
        if (this.updateSequenceNumberTimer) {
            clearTimeout(this.updateSequenceNumberTimer);
        }

        this.updateHasBeenRequested = false;
        this.updateSequenceNumberTimer = undefined;
    }
}

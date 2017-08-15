import { EventEmitter } from "events";
import { RangeTracker } from "../shared";
import { Document, IDeltaConnection } from "./document";
import { IObjectMessage, ISequencedObjectMessage } from "./protocol";

export class DeltaConnection implements IDeltaConnection {
    protected events = new EventEmitter();

    private rangeTracker: RangeTracker;

    private minSequenceNumber;

    private refSequenceNumber;

    public get minimumSequenceNumber(): number {
        return this.minSequenceNumber;
    }

    public get referenceSequenceNumber(): number {
        return this.refSequenceNumber;
    }

    constructor(
        public objectId: string,
        private document: Document,
        private sequenceNumber,
        documentSequenceNumber: number) {

        this.minSequenceNumber = sequenceNumber;
        this.rangeTracker = new RangeTracker(documentSequenceNumber, sequenceNumber);
        this.refSequenceNumber = documentSequenceNumber;
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public emit(
        message: IObjectMessage,
        clientId: string,
        documentSequenceNumber: number,
        documentMinimumSequenceNumber: number) {

        const sequenceNumber = ++this.sequenceNumber;
        this.rangeTracker.add(documentSequenceNumber, sequenceNumber);
        this.minSequenceNumber = this.rangeTracker.get(documentMinimumSequenceNumber);
        this.refSequenceNumber = message.referenceSequenceNumber;

        const sequencedObjectMessage: ISequencedObjectMessage = {
            clientId,
            clientSequenceNumber: message.clientSequenceNumber,
            contents: message.contents,
            minimumSequenceNumber: this.minSequenceNumber,
            referenceSequenceNumber: this.refSequenceNumber,
            sequenceNumber,
            type: message.type,
        };

        this.events.emit("op", sequencedObjectMessage);
    }

    public transformDocumentSequenceNumber(value: number) {
        return this.rangeTracker.get(value);
    }

    public updateMinSequenceNumber(value: number) {
        const newMinSequenceNumber = this.rangeTracker.get(value);

        // Notify clients when then number changed
        if (newMinSequenceNumber !== this.minimumSequenceNumber) {
            this.rangeTracker.updateBase(value);
            this.minSequenceNumber = newMinSequenceNumber;
            this.events.emit("minSequenceNumber", this.minSequenceNumber);
        }
    }

    /**
     * Send new messages to the server
     */
    public submit(message: IObjectMessage): this {
        this.document.submitObjectMessage({ address: this.objectId, contents: message });

        return this;
    }
}

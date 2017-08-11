import { EventEmitter } from "events";
import { RangeTracker } from "../shared";
import { Document, IDeltaConnection } from "./document";
import { IObjectMessage, ISequencedObjectMessage } from "./protocol";

export class DeltaConnection implements IDeltaConnection {
    protected events = new EventEmitter();

    private map: RangeTracker;

    private minSequenceNumber;

    public get minimumSequenceNumber(): number {
        return this.minSequenceNumber;
    }

    constructor(
        public objectId: string,
        private document: Document,
        private sequenceNumber,
        documentSequenceNumber: number) {

        this.minSequenceNumber = sequenceNumber;
        this.map = new RangeTracker(documentSequenceNumber, sequenceNumber);
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public emit(
        message: IObjectMessage,
        clientId: string,
        documentMinimumSequenceNumber: number,
        documentSequenceNumber: number) {

        const sequenceNumber = ++this.sequenceNumber;
        this.map.add(documentSequenceNumber, sequenceNumber);
        this.minSequenceNumber = this.map.get(documentMinimumSequenceNumber);

        const sequencedObjectMessage: ISequencedObjectMessage = {
            clientId,
            clientSequenceNumber: message.clientSequenceNumber,
            contents: message.contents,
            minimumSequenceNumber: this.minSequenceNumber,
            referenceSequenceNumber: message.referenceSequenceNumber,
            sequenceNumber,
            type: message.type,
        };

        this.events.emit("op", sequencedObjectMessage);
    }

    public updateMinSequenceNumber(value: number) {
        const newMinSequenceNumber = this.map.get(value);

        // Notify clients when then number changed
        if (newMinSequenceNumber !== this.minimumSequenceNumber) {
            this.map.updateBase(value);
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

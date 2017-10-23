import * as assert from "assert";
import { EventEmitter } from "events";
import { RangeTracker } from "../shared";
import { Document, IDeltaConnection } from "./document";
import { IObjectMessage, ISequencedObjectMessage, ITrace } from "./protocol";

export class DeltaConnection implements IDeltaConnection {
    protected events = new EventEmitter();

    private rangeTracker: RangeTracker;

    private minSequenceNumber: number;

    private refSequenceNumber: number;

    private sequenceNumber: number;

    public get minimumSequenceNumber(): number {
        return this.minSequenceNumber;
    }

    public get referenceSequenceNumber(): number {
        return this.refSequenceNumber;
    }

    /**
     * The lowest sequence number tracked by this map. Will normally be the document minimum
     * sequence number but may be higher in the case of an attach after the MSN.
     */
    public get baseSequenceNumber(): number {
        return this.rangeTracker.base;
    }

    constructor(public objectId: string, private document: Document) {
    }

    /**
     * Sets the base mapping from a local sequence number to the document sequence number that matches it
     */
    public setBaseMapping(sequenceNumber: number, documentSequenceNumber: number) {
        assert(!this.baseMappingIsSet());
        assert(sequenceNumber >= 0);

        this.sequenceNumber = sequenceNumber;
        this.minSequenceNumber = sequenceNumber;
        this.rangeTracker = new RangeTracker(documentSequenceNumber, sequenceNumber);
        this.refSequenceNumber = documentSequenceNumber;
    }

    /**
     * Returns whether or not setBaseMapping has been called
     */
    public baseMappingIsSet(): boolean {
        return !!this.rangeTracker;
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public emit(
        message: IObjectMessage,
        clientId: string,
        documentSequenceNumber: number,
        documentMinimumSequenceNumber: number,
        traces: ITrace[]) {

        assert(this.baseMappingIsSet());

        const sequenceNumber = ++this.sequenceNumber;
        this.rangeTracker.add(documentSequenceNumber, sequenceNumber);
        // Take the max between our base and the new MSN. In the case of a new document our MSN may be greater.
        this.minSequenceNumber = this.rangeTracker.get(Math.max(this.rangeTracker.base, documentMinimumSequenceNumber));
        this.refSequenceNumber = message.referenceSequenceNumber;

        const sequencedObjectMessage: ISequencedObjectMessage = {
            clientId,
            clientSequenceNumber: message.clientSequenceNumber,
            contents: message.contents,
            minimumSequenceNumber: this.minSequenceNumber,
            referenceSequenceNumber: this.refSequenceNumber,
            sequenceNumber,
            traces,
            type: message.type,
        };

        this.events.emit("op", sequencedObjectMessage);
    }

    public transformDocumentSequenceNumber(value: number) {
        assert(this.baseMappingIsSet());
        return this.rangeTracker.get(value);
    }

    public updateMinSequenceNumber(value: number) {
        assert(this.baseMappingIsSet());

        // The MSN may still be below the creation time for the object - don't update in this case
        if (value < this.rangeTracker.base) {
            return;
        }

        const newMinSequenceNumber = this.rangeTracker.get(value);
        this.rangeTracker.updateBase(value);

        // Notify clients when then number changed
        if (newMinSequenceNumber !== this.minimumSequenceNumber) {
            this.minSequenceNumber = newMinSequenceNumber;
            this.events.emit("minSequenceNumber", this.minSequenceNumber);
        }
    }

    /**
     * Send new messages to the server
     */
    public submit(message: IObjectMessage): Promise<void> {
        return this.document.submitObjectMessage({ address: this.objectId, contents: message });
    }
}

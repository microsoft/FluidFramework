import * as assert from "assert";
import { RangeTracker } from "../core-utils";
import { IDeltaConnection, IDeltaHandler, IDocument } from "./document";
import { IEnvelope, IObjectMessage, ISequencedDocumentMessage, ISequencedObjectMessage } from "./protocol";

export interface IMessageContext {
    objectMessage: ISequencedObjectMessage;
    handlerContext: any;
}

export class DeltaConnection implements IDeltaConnection {
    private rangeTracker: RangeTracker;

    // These are both defined in Object space
    private sequenceNumber: number;
    private minSequenceNumber: number;
    private handler: IDeltaHandler;

    public get minimumSequenceNumber(): number {
        return this.minSequenceNumber;
    }

    /**
     * The lowest sequence number tracked by this map. Will normally be the document minimum
     * sequence number but may be higher in the case of an attach after the MSN.
     */
    public get baseSequenceNumber(): number {
        return this.rangeTracker.base;
    }

    constructor(public objectId: string, private document: IDocument) {
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
    }

    public attach(handler: IDeltaHandler) {
        assert(!this.handler);
        this.handler = handler;
    }

    /**
     * Returns whether or not setBaseMapping has been called
     */
    public baseMappingIsSet(): boolean {
        return !!this.rangeTracker;
    }

    public async prepare(message: ISequencedDocumentMessage): Promise<IMessageContext> {
        const objectMessage = this.translateToObjectMessage(message);
        const handlerContext = await this.handler.prepare(objectMessage);

        return {
            handlerContext,
            objectMessage,
        };
    }

    public process(message: ISequencedDocumentMessage, context: IMessageContext) {
        assert(this.baseMappingIsSet());
        assert(this.handler);

        // update internal fields
        this.sequenceNumber = context.objectMessage.sequenceNumber;
        this.rangeTracker.add(message.sequenceNumber, context.objectMessage.sequenceNumber);
        this.minSequenceNumber = context.objectMessage.minimumSequenceNumber;

        this.handler.process(context.objectMessage, context.handlerContext);
    }

    public transformDocumentSequenceNumber(value: number) {
        assert(this.baseMappingIsSet());
        return this.rangeTracker.get(value);
    }

    public updateMinSequenceNumber(value: number) {
        assert(this.baseMappingIsSet());
        assert(this.handler);

        // The MSN may still be below the creation time for the object - don't update in this case
        if (value < this.rangeTracker.base) {
            return;
        }

        const newMinSequenceNumber = this.rangeTracker.get(value);
        this.rangeTracker.updateBase(value);

        // Notify clients when then number changed
        if (newMinSequenceNumber !== this.minimumSequenceNumber) {
            this.minSequenceNumber = newMinSequenceNumber;
            this.handler.minSequenceNumberChanged(this.minSequenceNumber);
        }
    }

    /**
     * Send new messages to the server
     */
    public submit(message: IObjectMessage): Promise<void> {
        return this.document.submitObjectMessage({ address: this.objectId, contents: message });
    }

    private translateToObjectMessage(documentMessage: ISequencedDocumentMessage): ISequencedObjectMessage {
        assert(this.baseMappingIsSet());
        assert(this.handler);

        const envelope = documentMessage.contents as IEnvelope;
        const message = envelope.contents as IObjectMessage;

        // Take the max between our base and the new MSN. In the case of a new document our MSN may be greater.
        // We do not need to add to the rangeTracker in this case since by definition the MSN must be strictly less
        // than the sequence number
        const minSequenceNumber = this.rangeTracker.get(
            Math.max(this.rangeTracker.base, documentMessage.minimumSequenceNumber));

        const sequencedObjectMessage: ISequencedObjectMessage = {
            clientId: documentMessage.clientId,
            clientSequenceNumber: message.clientSequenceNumber,
            contents: message.contents,
            minimumSequenceNumber: minSequenceNumber,
            origin: documentMessage.origin,
            referenceSequenceNumber: message.referenceSequenceNumber,
            sequenceNumber: this.sequenceNumber + 1,
            traces: documentMessage.traces,
            type: message.type,
            user: documentMessage.user,
        };
        return sequencedObjectMessage;
    }
}

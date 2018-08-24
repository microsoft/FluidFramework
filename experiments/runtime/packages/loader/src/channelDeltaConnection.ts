import {
    ConnectionState,
    IDeltaConnection,
    IDeltaHandler,
    IEnvelope,
    IObjectMessage,
    ISequencedDocumentMessage,
    ISequencedObjectMessage,
} from "@prague/runtime-definitions";
import { RangeTracker } from "@prague/utils";
import * as assert from "assert";

export interface IMessageContext {
    objectMessage: ISequencedObjectMessage;
    handlerContext: any;
}

export class ChannelDeltaConnection implements IDeltaConnection {
    private rangeTracker: RangeTracker;

    // These are both defined in Object space
    // tslint:disable-next-line:variable-name
    private _sequenceNumber: number;
    private minSequenceNumber: number;
    private handler: IDeltaHandler;

    public get state(): ConnectionState {
        return this._state;
    }

    public get minimumSequenceNumber(): number {
        return this.minSequenceNumber;
    }

    public get sequenceNumber(): number {
        return this._sequenceNumber;
    }

    // tslint:disable:variable-name
    constructor(
        public objectId: string,
        private _state: ConnectionState,
        private submitFn: (message: IObjectMessage) => void) {
    }
    // tslint:enable:variable-name

    /**
     * Sets the base mapping from a local sequence number to the document sequence number that matches it
     */
    public setBaseMapping(sequenceNumber: number, documentSequenceNumber: number) {
        assert(!this.baseMappingIsSet());
        assert(sequenceNumber >= 0);

        this._sequenceNumber = sequenceNumber;
        this.minSequenceNumber = sequenceNumber;
        this.rangeTracker = new RangeTracker(documentSequenceNumber, sequenceNumber);
    }

    public attach(handler: IDeltaHandler) {
        assert(!this.handler);
        this.handler = handler;
    }

    public setConnectionState(state: ConnectionState) {
        this._state = state;
        this.handler.setConnectionState(state as any);
    }

    /**
     * Returns whether or not setBaseMapping has been called
     */
    public baseMappingIsSet(): boolean {
        return !!this.rangeTracker;
    }

    public async prepare(message: ISequencedDocumentMessage): Promise<IMessageContext> {
        assert(this.baseMappingIsSet());
        assert(this.handler);

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
        this._sequenceNumber = context.objectMessage.sequenceNumber;
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
    public submit(message: IObjectMessage): void {
        this.submitFn(message);
    }

    // NOTE - do not call directly
    // This is marked public only temporarily as we update the snapshot format for shared string to include
    // the set of tardis'd messages.
    public translateToObjectMessage(
        documentMessage: ISequencedDocumentMessage,
        updateState = false): ISequencedObjectMessage {

        assert(this.baseMappingIsSet());

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
            sequenceNumber: this._sequenceNumber + 1,
            type: message.type,
            user: documentMessage.user,
        };

        // TODO remove this when making method private
        if (updateState) {
            this._sequenceNumber = sequencedObjectMessage.sequenceNumber;
            this.rangeTracker.add(documentMessage.sequenceNumber, sequencedObjectMessage.sequenceNumber);
            this.minSequenceNumber = sequencedObjectMessage.minimumSequenceNumber;
        }

        return sequencedObjectMessage;
    }
}

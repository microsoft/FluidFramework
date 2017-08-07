import { EventEmitter } from "events";
import { Document, IDeltaConnection } from "./document";
import { IObjectMessage, ISequencedObjectMessage } from "./protocol";

/**
 * Helper class that keeps track of the mapping between a primary and secondary number.
 */
interface IRangeMap {

    updateBase(primary: number);

    addMapping(primary: number, secondary: number);

    getClosest(primary: number);
}

export class DeltaConnection implements IDeltaConnection {
    protected events = new EventEmitter();

    private map: IRangeMap;

    constructor(
        public objectId: string,
        private document: Document,
        private sequenceNumber,
        documentSequenceNumber: number) {

        this.map.addMapping(documentSequenceNumber, sequenceNumber);
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

        const sequenceNumber = this.sequenceNumber++;
        this.map.addMapping(documentSequenceNumber, sequenceNumber);

        // Store a mapping from a documentSequenceNumber to the assigned sequenceNumber

        // TODO here is when I need to process the sequence number
        const sequencedObjectMessage: ISequencedObjectMessage = {
            clientId,
            clientSequenceNumber: message.clientSequenceNumber,
            contents: message.contents,
            minimumSequenceNumber: this.map.getClosest(documentMinimumSequenceNumber),
            referenceSequenceNumber: message.referenceSequenceNumber,
            sequenceNumber,
            type: message.type,
        };

        this.events.emit("op", sequencedObjectMessage);
    }

    /**
     * Send new messages to the server
     */
    public submit(message: IObjectMessage): this {
        this.document.submitObjectMessage({ address: this.objectId, contents: message });

        return this;
    }
}

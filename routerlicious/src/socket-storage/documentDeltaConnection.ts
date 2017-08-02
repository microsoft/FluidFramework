import { EventEmitter } from "events";
import * as api from "../api";
import { DocumentService } from "./documentService";

/**
 * Represents a connection to a stream of delta updates
 */
export class DocumentDeltaConnection implements api.IDocumentDeltaConnection {
    private emitter = new EventEmitter();

    constructor(private service: DocumentService, public documentId: string, public clientId: string) {
    }

    /**
     * Subscribe to events emitted by the document
     */
    public on(event: string, listener: (...args: any[]) => void): this {
        this.service.registerForEvent(event, this);
        this.emitter.on(event, listener);
        return this;
    }

    /**
     * Submits a new delta operation to the server
     */
    public submitOp(message: api.IMessage): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.service.emit("submitOp", this.clientId, message, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Updates the reference sequence number on the given connection to the provided value
     */
    public updateReferenceSequenceNumber(objectId: string, sequenceNumber: number): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.service.emit("updateReferenceSequenceNumber", this.clientId, sequenceNumber, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Dispatches the given event to any registered listeners.
     * This is an internal method.
     */
    public dispatchEvent(name: string, ...args: any[]) {
        this.emitter.emit(name, ...args);
    }
}

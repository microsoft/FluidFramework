import * as api from "../api-core";
import { LoadService } from "../socket-storage";

// Mimics a connection to a document delta connection for document loading.
export class IdleDocumentDeltaConnection implements api.IDocumentDeltaConnection {

    constructor(
        public service: LoadService,
        public documentId: string,
        public clientId: string,
        public encrypted: boolean,
        public privateKey: string,
        public publicKey: string) {
    }

    /**
     * Subscribe to events emitted by the document
     */
    public on(event: string, listener: (...args: any[]) => void): this {
        return this;
    }

    /**
     * Submits a new delta operation to the server
     */
    public submit(message: api.IDocumentMessage): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Updates the reference sequence number on the given connection to the provided value
     */
    public updateReferenceSequenceNumber(objectId: string, sequenceNumber: number): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Dispatches the given event to any registered listeners.
     * This is an internal method.
     */
    public dispatchEvent(name: string, ...args: any[]) {
        // Dispatch events here.
    }
}

import { EventEmitter } from "events";
import * as api from "../api-core";
import { BatchManager, Deferred } from "../core-utils";
import { DocumentService } from "./documentService";

/**
 * A pending message the batch manager is holding on to
 */
interface IPendingSend {
    // The deferred is used to resolve a promise once the message is sent
    deferred: Deferred<any>;

    // The message to send
    message: any;
}

/**
 * Represents a connection to a stream of delta updates
 */
export class DocumentDeltaConnection implements api.IDocumentDeltaConnection {
    private emitter = new EventEmitter();
    private submitManager: BatchManager<IPendingSend>;

    constructor(
        private service: DocumentService,
        public documentId: string,
        public clientId: string,
        public encrypted: boolean,
        public privateKey: string,
        public publicKey: string) {

            this.submitManager = new BatchManager<IPendingSend>((submitType, work) => {
                this.service.emit(submitType, this.clientId, work.map((message) => message.message), (error) => {
                    if (error) {
                        work.forEach((message) => message.deferred.reject(error));
                    } else {
                        work.forEach((message) => message.deferred.resolve());
                    }
                });
            });
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
    public submit(message: api.IDocumentMessage): Promise<void> {
        const deferred = new Deferred<any>();
        this.submitManager.add("submitOp", { deferred, message } );
        return deferred.promise;
    }

    /**
     * Updates the reference sequence number on the given connection to the provided value
     */
    public updateReferenceSequenceNumber(objectId: string, message: number): Promise<void> {
        const deferred = new Deferred<any>();
        this.submitManager.add("updateReferenceSequenceNumber", { deferred, message } );
        return deferred.promise;
    }

    /**
     * Dispatches the given event to any registered listeners.
     * This is an internal method.
     */
    public dispatchEvent(name: string, ...args: any[]) {
        this.emitter.emit(name, ...args);
    }
}

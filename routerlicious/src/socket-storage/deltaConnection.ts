import { EventEmitter } from "events";
import * as api from "../api";
import { DeltaNotificationService } from "./deltaNotificationService";

/**
 * Represents a connection to a stream of delta updates
 */
export class DeltaConnection implements api.IDeltaConnection {
    private emitter = new EventEmitter();

    constructor(
        private service: DeltaNotificationService,
        public objectId: string,
        public clientId: string,
        public existing: boolean,
        public versions: any[]) {
    }

    /**
     * Subscribe to events emitted by the document
     */
    public on(event: string, listener: Function): this {
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
    public updateReferenceSequenceNumber(sequenceNumber: number): Promise<void> {
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

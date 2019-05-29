import { ISequencedDocumentMessage, ITree, MessageType } from "@prague/container-definitions";
import { IComponentRuntime, IObjectStorageService } from "@prague/runtime-definitions";
import { SharedObject } from "@prague/shared-object-common";
import * as assert from "assert";
import { debug } from "./debug";
import { IConsensusOrderedCollection, IOrderedCollection } from "./interfaces";
import { ConsensusValueType, IConsensusOrderedCollectionValue } from "./values";

/**
 * An operation for consensus ordered collection
 */
interface IConsensusOrderedCollectionOperation {
    opName: string;
    value?: IConsensusOrderedCollectionValue;
}

/**
 * A record of the pending operation
 */
interface IPendingRecord {
    /**
     * The resolve function to call after the operation is ack'ed
     */
    resolve: (value: any) => void;

    /**
     * The client sequence number of the operation. For assert only.
     */
    clientSequenceNumber: number;

    /**
     * The original operation message. For assert only.
     */
    message: IConsensusOrderedCollectionOperation;
}

/**
 * Result of removeFull, including whether we have a value to remove
 */
interface IRemoveFullResult {
    wasRemoved: boolean;
    value: any;
}

/**
 * Implementation of a consensus collection distributed object
 *
 * Generally not used directly. A derived type will pass in a backing data type
 * IOrderedCollection that will define the deterministic add/remove order and snapshot ability.
 * Implements the distributed object's communication, handles the sending/processing
 * operations, provides the asynchronous API and manage the promise resolution.
 */
export class ConsensusOrderedCollection<T = any> extends SharedObject implements IConsensusOrderedCollection<T> {
    private readonly promiseResolveQueue = new Array<IPendingRecord>();

    /**
     * Constructs a new consensus collection. If the object is non-local an id and service interfaces will
     * be provided
     */
    protected constructor(
        id: string,
        runtime: IComponentRuntime,
        type: string,
        private readonly data: IOrderedCollection<T>,
    ) {
        super(id, runtime, type);
    }

    /**
     * Add a value to the consensus collection.
     */
    public async add(value: T): Promise<void> {
        if (this.isLocal()) {
            // For the case where this is not attached yet, explicitly JSON
            // clone the value to match the behavior of going thru the wire.
            const addValue = JSON.parse(JSON.stringify(value)) as T;
            this.addCore(addValue);
            return Promise.resolve();
        }

        let operationValue: IConsensusOrderedCollectionValue;
        /* tslint:disable:no-unsafe-any */

        // TODO: Not all shared object will be derived from SharedObject
        if (value instanceof SharedObject) {
            if (!this.isLocal()) {
                // Ensure a referenced shared object is attached.
                value.attach();
            }

            operationValue = {
                type: ConsensusValueType[ConsensusValueType.Shared],
                value: value.id,
            };
        } else {
            operationValue = {
                type: ConsensusValueType[ConsensusValueType.Plain],
                value,
            };
        }

        const op: IConsensusOrderedCollectionOperation = {
            opName: "add",
            value: operationValue,
        };
        return this.submit(op);
    }

    /**
     * Remove a value from the consensus collection.  If the collection is empty, returns undefined.
     */
    public async remove(): Promise<T> {
        const removeFullResult = await this.removeFull();
        return removeFullResult.value;
    }

    /**
     * Wait for a value to be available and remove it from the consensus collection
     */
    public async waitAndRemove(): Promise<T> {
        // tslint:disable:no-constant-condition
        while (true) {
            if (this.data.size() === 0) {
                // wait for new entry before trying to remove again
                await new Promise((resolve, reject) => {
                    this.once("add", resolve);
                });
            }

            const removeFullResult = await this.removeFull();
            if (removeFullResult.wasRemoved) {
                // Found a value, return value
                return removeFullResult.value;
            }

            // the collection is empty, try again
        }
    }

    public snapshot(): ITree {
        return this.data.snapshot();
    }

    protected async loadCore(
        minimumSequenceNumber: number,
        headerOrigin: string,
        storage: IObjectStorageService): Promise<void> {

        return this.data.load(this.runtime, storage);
    }

    protected initializeLocalCore() {
        return;
    }

    protected attachCore() {
        return;
    }

    protected onDisconnect() {
        debug(`ConsensusCollection ${this.id} is now disconnected`);
    }

    protected onConnect(pending: any[]) {
        for (const message of pending) {
            this.submitLocalMessage(message);
        }

        return;
    }

    protected async prepareCore(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        if (message.type === MessageType.Operation && !local) {
            const op: IConsensusOrderedCollectionOperation = message.contents;
            if (op.opName === "add") {
                /* tslint:disable:no-return-await */
                return op.value.type === ConsensusValueType[ConsensusValueType.Shared]
                    ? await this.runtime.getChannel(op.value.value)
                    : op.value.value;
            }
        }
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean, context: any) {
        if (message.type === MessageType.Operation) {
            const op: IConsensusOrderedCollectionOperation = message.contents;
            let value;
            switch (op.opName) {
                case "add":
                    this.addCore(op.value.value);
                    break;

                case "remove":
                    const hasValue = this.data.size() !== 0;
                    value = { wasRemoved: hasValue, value: hasValue ? this.removeCore() : undefined };
                    break;

                default:
                    throw new Error("Unknown operation");
            }
            // If it is local operation, resolve the promise.
            if (local) {
                this.processLocalMessage(message, value);
            }
        }
    }

    /**
     * Resolve the promise of a local operation
     *
     * @param message - the message of the operation
     * @param value - the value related to the operation
     */
    private processLocalMessage(message: ISequencedDocumentMessage, value: any) {
        const pending = this.promiseResolveQueue.shift();
        assert(message.contents.opName === pending.message.opName);
        assert(message.clientSequenceNumber === -1
            || message.clientSequenceNumber === pending.clientSequenceNumber);
        pending.resolve(value);
    }

    private async submit(
        message: IConsensusOrderedCollectionOperation): Promise<any> {

        assert(!this.isLocal());

        const clientSequenceNumber = this.submitLocalMessage(message);
        // False positive - tslint couldn't track that the promise is stored in promiseResolveQueue and resolved later
        // tslint:disable:promise-must-complete
        return new Promise((resolve, reject) => {
            // Note that clientSequenceNumber and message is only used for asserts and isn't strictly necessary.
            this.promiseResolveQueue.push({ resolve, clientSequenceNumber, message });
        });
    }

    private addCore(value: T) {
        this.data.add(value);
        this.emit("add", value);
    }

    private removeCore(): T {
        // Call should check if it is empty first
        assert(this.data.size() !== 0);
        const value = this.data.remove();

        // Note remove event only fires if there are value removed
        // Not if it is empty
        this.emit("remove", value);
        return value;
    }

    private async removeFull(): Promise<IRemoveFullResult> {
        if (this.isLocal()) {
            const hasValue = this.data.size() !== 0;
            const value = hasValue ? this.removeCore() : undefined;
            return Promise.resolve({ wasRemoved: hasValue, value });
        }

        const op: IConsensusOrderedCollectionOperation = {
            opName: "remove",
        };
        return this.submit(op);
    }
}

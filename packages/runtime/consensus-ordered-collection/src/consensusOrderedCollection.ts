/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ISequencedDocumentMessage, ITree, MessageType } from "@microsoft/fluid-protocol-definitions";
import { IChannelAttributes, IComponentRuntime, IObjectStorageService } from "@microsoft/fluid-runtime-definitions";
import { SharedObject, ValueType } from "@microsoft/fluid-shared-object-base";
import { debug } from "./debug";
import { IConsensusOrderedCollection, IOrderedCollection } from "./interfaces";
import { IConsensusOrderedCollectionValue } from "./values";

/**
 * An operation for consensus ordered collection
 */
interface IConsensusOrderedCollectionRemoveOperation {
    opName: "remove";
}

interface IConsensusOrderedCollectionAddOperation {
    opName: "add";
    value: IConsensusOrderedCollectionValue;
}

type IConsensusOrderedCollectionOperation =
    IConsensusOrderedCollectionAddOperation | IConsensusOrderedCollectionRemoveOperation;

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
 * Implementation of a consensus collection shared object
 *
 * Generally not used directly. A derived type will pass in a backing data type
 * IOrderedCollection that will define the deterministic add/remove order and snapshot ability.
 * Implements the shared object's communication, handles the sending/processing
 * operations, provides the asynchronous API and manage the promise resolution.
 */
export class ConsensusOrderedCollection<T = any> extends SharedObject implements IConsensusOrderedCollection<T> {
    private readonly promiseResolveQueue: IPendingRecord[] = [];

    /**
     * Constructs a new consensus collection. If the object is non-local an id and service interfaces will
     * be provided
     */
    protected constructor(
        id: string,
        runtime: IComponentRuntime,
        attributes: IChannelAttributes,
        private readonly data: IOrderedCollection<T>,
    ) {
        super(id, runtime, attributes);
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

        // TODO: Not all shared object will be derived from SharedObject
        if (SharedObject.is(value)) {
            if (!this.isLocal()) {
                // Ensure a referenced shared object is attached.
                value.register();
            }

            operationValue = {
                type: ValueType[ValueType.Shared],
                value: value.id,
            };
        } else {
            operationValue = {
                type: ValueType[ValueType.Plain],
                value,
            };
        }

        const op: IConsensusOrderedCollectionAddOperation = {
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
        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (this.data.size() === 0) {
                // Wait for new entry before trying to remove again
                await new Promise((resolve, reject) => {
                    this.once("add", resolve);
                });
            }

            const removeFullResult = await this.removeFull();
            if (removeFullResult.wasRemoved) {
                // Found a value, return value
                return removeFullResult.value;
            }

            // The collection is empty, try again
        }
    }

    public snapshot(): ITree {
        return this.data.snapshot();
    }

    protected onConnect(pending: any[]) {
        // resubmit non-acked messages
        for (const record of this.promiseResolveQueue) {
            record.clientSequenceNumber = this.submitLocalMessage(record.message);
        }
    }

    protected async loadCore(
        branchId: string,
        storage: IObjectStorageService): Promise<void> {

        return this.data.load(this.runtime, storage);
    }

    protected registerCore() {
        return;
    }

    protected onDisconnect() {
        debug(`ConsensusCollection ${this.id} is now disconnected`);
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean) {
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const pending = this.promiseResolveQueue.shift()!;
        assert(pending);
        assert(message.contents.opName === pending.message.opName);
        assert(message.clientSequenceNumber === -1
            || message.clientSequenceNumber === pending.clientSequenceNumber);
        pending.resolve(value);
    }

    private async submit(
        message: IConsensusOrderedCollectionOperation): Promise<any> {

        assert(!this.isLocal());

        const clientSequenceNumber = this.submitLocalMessage(message);
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
        // Caller should check if it is empty first
        assert(this.data.size() !== 0);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const value = this.data.remove()!;

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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidSerializer, ValueType } from "@fluidframework/shared-object-base";
import { assert, TypedEventEmitter } from "@fluidframework/common-utils";
import {
    ISerializableValue,
    ISerializedValue,
    ISharedMapEvents,
} from "./interfaces";
import {
    ILocalValue,
    LocalValueMaker,
    makeSerializable,
} from "./localValues";

/**
 * Defines the means to process and submit a given op on a map.
 */
interface IMapMessageHandler {
    /**
     * Apply the given operation.
     * @param op - The map operation to apply
     * @param local - Whether the message originated from the local client
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     */
    process(
        op: IMapOperation,
        local: boolean,
        localOpMetadata: unknown,
    ): void;

    /**
     * Communicate the operation to remote clients.
     * @param op - The map operation to submit
     * @param localOpMetadata - The metadata to be submitted with the message.
     */
    submit(op: IMapOperation, localOpMetadata: unknown): void;

    getStashedOpLocalMetadata(op: IMapOperation): unknown;
}

/**
 * Operation indicating a value should be set for a key.
 */
export interface IMapSetOperation {
    /**
     * String identifier of the operation type.
     */
    type: "set";

    /**
     * Map key being modified.
     */
    key: string;

    /**
     * Value to be set on the key.
     */
    value: ISerializableValue;
}

/**
 * Operation indicating a key should be deleted from the map.
 */
export interface IMapDeleteOperation {
    /**
     * String identifier of the operation type.
     */
    type: "delete";

    /**
     * Map key being modified.
     */
    key: string;
}

/**
 * Map key operations are one of several types.
 */
export type IMapKeyOperation = IMapSetOperation | IMapDeleteOperation;

/**
 * Operation indicating the map should be cleared.
 */
export interface IMapClearOperation {
    /**
     * String identifier of the operation type.
     */
    type: "clear";
}

/**
 * Description of a map delta operation
 */
export type IMapOperation = IMapKeyOperation | IMapClearOperation;

/**
 * Defines the in-memory object structure to be used for the conversion to/from serialized.
 * Directly used in JSON.stringify, direct result from JSON.parse
 */
export interface IMapDataObjectSerializable {
    [key: string]: ISerializableValue;
}

export interface IMapDataObjectSerialized {
    [key: string]: ISerializedValue;
}

interface IMapLocalOpMetadata {
    pendingMessageId: number;
    previousValue: ILocalValue;
}

/**
 * A SharedMap is a map-like distributed data structure.
 */
export class MapKernel {
    /**
     * The number of key/value pairs stored in the map.
     */
    public get size(): number {
        return this.data.size;
    }

    /**
     * Mapping of op types to message handlers.
     */
    private readonly messageHandlers: ReadonlyMap<string, IMapMessageHandler> = new Map();

    /**
     * The in-memory data the map is storing.
     */
    private readonly data = new Map<string, ILocalValue>();

    /**
     * Keys that have been modified locally but not yet ack'd from the server.
     */
    private readonly pendingKeys: Map<string, IMapLocalOpMetadata[]> = new Map();

    /**
     * This is used to assign a unique id to every outgoing operation and helps in tracking unack'd ops.
     */
    private pendingMessageId: number = -1;

    /**
     * If a clear has been performed locally but not yet ack'd from the server, then this stores the pending id
     * of that clear operation. Otherwise, is -1.
     */
    private pendingClearMessageId: number = -1;

    /**
     * Object to create encapsulations of the values stored in the map.
     */
    private readonly localValueMaker: LocalValueMaker;

    /**
     * Create a new shared map kernel.
     * @param serializer - The serializer to serialize / parse handles
     * @param handle - The handle of the shared object using the kernel
     * @param submitMessage - A callback to submit a message through the shared object
     * @param isAttached - To query whether the shared object should generate ops
     * @param valueTypes - The value types to register
     * @param eventEmitter - The object that will emit map events
     */
    constructor(
        private readonly serializer: IFluidSerializer,
        private readonly handle: IFluidHandle,
        private readonly submitMessage: (op: any, localOpMetadata: unknown) => void,
        private readonly isAttached: () => boolean,
        private readonly eventEmitter: TypedEventEmitter<ISharedMapEvents>,
    ) {
        this.localValueMaker = new LocalValueMaker(serializer);
        this.messageHandlers = this.getMessageHandlers();
    }

    /**
     * Get an iterator over the keys in this map.
     * @returns The iterator
     */
    public keys(): IterableIterator<string> {
        return this.data.keys();
    }

    /**
     * Get an iterator over the entries in this map.
     * @returns The iterator
     */
    public entries(): IterableIterator<[string, any]> {
        const localEntriesIterator = this.data.entries();
        const iterator = {
            next(): IteratorResult<[string, any]> {
                const nextVal = localEntriesIterator.next();
                if (nextVal.done) {
                    return { value: undefined, done: true };
                } else {
                    // Unpack the stored value
                    return { value: [nextVal.value[0], nextVal.value[1].value], done: false };
                }
            },
            [Symbol.iterator]() {
                return this;
            },
        };
        return iterator;
    }

    /**
     * Get an iterator over the values in this map.
     * @returns The iterator
     */
    public values(): IterableIterator<any> {
        const localValuesIterator = this.data.values();
        const iterator = {
            next(): IteratorResult<any> {
                const nextVal = localValuesIterator.next();
                if (nextVal.done) {
                    return { value: undefined, done: true };
                } else {
                    // Unpack the stored value
                    return { value: nextVal.value.value, done: false };
                }
            },
            [Symbol.iterator]() {
                return this;
            },
        };
        return iterator;
    }

    /**
     * Get an iterator over the entries in this map.
     * @returns The iterator
     */
    public [Symbol.iterator](): IterableIterator<[string, any]> {
        return this.entries();
    }

    /**
     * Executes the given callback on each entry in the map.
     * @param callbackFn - Callback function
     */
    public forEach(callbackFn: (value: any, key: string, map: Map<string, any>) => void): void {
        this.data.forEach((localValue, key, m) => {
            callbackFn(localValue.value, key, m);
        });
    }

    /**
     * {@inheritDoc ISharedMap.get}
     */
    public get<T = any>(key: string): T | undefined {
        if (!this.data.has(key)) {
            return undefined;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const localValue = this.data.get(key)!;

        return localValue.value as T;
    }

    /**
     * Check if a key exists in the map.
     * @param key - The key to check
     * @returns True if the key exists, false otherwise
     */
    public has(key: string): boolean {
        return this.data.has(key);
    }

    /**
     * {@inheritDoc ISharedMap.set}
     */
    public set(key: string, value: any) {
        // Undefined/null keys can't be serialized to JSON in the manner we currently snapshot.
        if (key === undefined || key === null) {
            throw new Error("Undefined and null keys are not supported");
        }

        // Create a local value and serialize it.
        const localValue = this.localValueMaker.fromInMemory(value);
        const serializableValue = makeSerializable(
            localValue,
            this.serializer,
            this.handle);

        // Set the value locally.
        const previousValue = this.setCore(
            key,
            localValue,
            true,
        );

        // If we are not attached, don't submit the op.
        if (!this.isAttached()) {
            return;
        }

        const op: IMapSetOperation = {
            key,
            type: "set",
            value: serializableValue,
        };
        this.submitMapKeyMessage(op, previousValue);
    }

    /**
     * Delete a key from the map.
     * @param key - Key to delete
     * @returns True if the key existed and was deleted, false if it did not exist
     */
    public delete(key: string): boolean {
        // Delete the key locally first.
        const previousValue = this.deleteCore(key, true);

        // If we are not attached, don't submit the op.
        if (!this.isAttached()) {
            return previousValue !== undefined;
        }

        const op: IMapDeleteOperation = {
            key,
            type: "delete",
        };
        this.submitMapKeyMessage(op, previousValue);

        return previousValue !== undefined;
    }

    /**
     * Clear all data from the map.
     */
    public clear(): void {
        // Clear the data locally first.
        this.clearCore(true);

        // If we are not attached, don't submit the op.
        if (!this.isAttached()) {
            return;
        }

        const op: IMapClearOperation = {
            type: "clear",
        };
        this.submitMapClearMessage(op);
    }

    /**
     * Serializes the data stored in the shared map to a JSON string
     * @param serializer - The serializer to use to serialize handles in its values.
     * @returns A JSON string containing serialized map data
     */
    public getSerializedStorage(serializer: IFluidSerializer): IMapDataObjectSerialized {
        const serializableMapData: IMapDataObjectSerialized = {};
        this.data.forEach((localValue, key) => {
            serializableMapData[key] = localValue.makeSerialized(serializer, this.handle);
        });
        return serializableMapData;
    }

    public getSerializableStorage(serializer: IFluidSerializer): IMapDataObjectSerializable {
        const serializableMapData: IMapDataObjectSerializable = {};
        this.data.forEach((localValue, key) => {
            serializableMapData[key] = makeSerializable(localValue, serializer, this.handle);
        });
        return serializableMapData;
    }

    public serialize(serializer: IFluidSerializer): string {
        return JSON.stringify(this.getSerializableStorage(serializer));
    }

    /**
     * Populate the kernel with the given map data.
     * @param data - A JSON string containing serialized map data
     */
    public populateFromSerializable(json: IMapDataObjectSerializable): void {
        for (const [key, serializable] of Object.entries(json)) {
            const localValue = {
                key,
                value: this.makeLocal(key, serializable),
            };

            this.data.set(localValue.key, localValue.value);
        }
    }

    public populate(json: string): void {
        this.populateFromSerializable(JSON.parse(json) as IMapDataObjectSerializable);
    }

    /**
     * Submit the given op if a handler is registered.
     * @param op - The operation to attempt to submit
     * @param localOpMetadata - The local metadata associated with the op. This is kept locally by the runtime
     * and not sent to the server. This will be sent back when this message is received back from the server. This is
     * also sent if we are asked to resubmit the message.
     * @returns True if the operation was submitted, false otherwise.
     */
    public trySubmitMessage(op: any, localOpMetadata: unknown): boolean {
        const type: string = op.type;
        if (this.messageHandlers.has(type)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.messageHandlers.get(type)!.submit(op as IMapOperation, localOpMetadata);
            return true;
        }
        return false;
    }

    public tryGetStashedOpLocalMetadata(op: any): unknown {
        const type: string = op.type;
        if (this.messageHandlers.has(type)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return this.messageHandlers.get(type)!.getStashedOpLocalMetadata(op as IMapOperation);
        }
        throw new Error("no apply stashed op handler");
    }

    /**
     * Process the given op if a handler is registered.
     * @param op - The message to process
     * @param local - Whether the message originated from the local client
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     * @returns True if the operation was processed, false otherwise.
     */
    public tryProcessMessage(
        op: IMapOperation,
        local: boolean,
        localOpMetadata: unknown,
    ): boolean {
        if (this.messageHandlers.has(op.type)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.messageHandlers
                .get(op.type)!
                .process(op, local, localOpMetadata);
            return true;
        }
        return false;
    }

    /**
     * Rollback a local op
     * @param op - The operation to rollback
     * @param localOpMetadata - The local metadata associated with the op.
     */
    public rollback(op: any, localOpMetadata: unknown) {
        if (op.type !== "delete" && op.type !== "set") {
            throw new Error("Unsupported op for rollback");
        }

        const metadata = localOpMetadata as IMapLocalOpMetadata;
        if (metadata.previousValue === undefined) {
            this.deleteCore(op.key, true);
        } else {
            this.setCore(op.key, metadata.previousValue, true);
        }

        const pendingMetadata = this.pendingKeys.get(op.key);
        const lastPending = pendingMetadata?.pop();
        if (!pendingMetadata || !lastPending || lastPending.pendingMessageId !== metadata.pendingMessageId) {
            throw new Error("Rollback op does not match last pending");
        }
        if (pendingMetadata.length === 0) {
            this.pendingKeys.delete(op.key);
        }
    }

    /**
     * Set implementation used for both locally sourced sets as well as incoming remote sets.
     * @param key - The key being set
     * @param value - The value being set
     * @param local - Whether the message originated from the local client
     * @returns Previous value of the key
     */
    private setCore(key: string, value: ILocalValue, local: boolean): any {
        const previousValue = this.get(key);
        this.data.set(key, value);
        this.eventEmitter.emit("valueChanged", { key, previousValue }, local, this.eventEmitter);
        return previousValue;
    }

    /**
     * Clear implementation used for both locally sourced clears as well as incoming remote clears.
     * @param local - Whether the message originated from the local client
     * @param op - The message if from a remote clear, or null if from a local clear
     */
    private clearCore(local: boolean): void {
        this.data.clear();
        this.eventEmitter.emit("clear", local, this.eventEmitter);
    }

    /**
     * Delete implementation used for both locally sourced deletes as well as incoming remote deletes.
     * @param key - The key being deleted
     * @param local - Whether the message originated from the local client
     * @returns Previous value of the key if it existed, undefined if it did not exist
     */
    private deleteCore(key: string, local: boolean): any {
        const previousValue = this.get(key);
        const successfullyRemoved = this.data.delete(key);
        if (successfullyRemoved) {
            this.eventEmitter.emit("valueChanged", { key, previousValue }, local, this.eventEmitter);
        }
        return previousValue;
    }

    /**
     * Clear all keys in memory in response to a remote clear, but retain keys we have modified but not yet been ack'd.
     */
    private clearExceptPendingKeys(): void {
        // Assuming the pendingKeys is small and the map is large
        // we will get the value for the pendingKeys and clear the map
        const temp = new Map<string, ILocalValue>();
        this.pendingKeys.forEach((value, key) => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            temp.set(key, this.data.get(key)!);
        });
        this.data.clear();
        temp.forEach((value, key) => {
            this.data.set(key, value);
        });
    }

    /**
     * The remote ISerializableValue we're receiving (either as a result of a load or an incoming set op) will
     * have the information we need to create a real object, but will not be the real object yet.  For example,
     * we might know it's a map and the map's ID but not have the actual map or its data yet.  makeLocal's
     * job is to convert that information into a real object for local usage.
     * @param key - The key that the caller intends to store the local value into (used for ops later).  But
     * doesn't actually store the local value into that key.  So better not lie!
     * @param serializable - The remote information that we can convert into a real object
     * @returns The local value that was produced
     */
    private makeLocal(key: string, serializable: ISerializableValue): ILocalValue {
        if (serializable.type === ValueType[ValueType.Plain] || serializable.type === ValueType[ValueType.Shared]) {
            return this.localValueMaker.fromSerializable(serializable);
        } else {
            throw new Error("Unknown local value type");
        }
    }

    /**
     * If our local operations that have not yet been ack'd will eventually overwrite an incoming operation, we should
     * not process the incoming operation.
     * @param op - Operation to check
     * @param local - Whether the message originated from the local client
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     * @returns True if the operation should be processed, false otherwise
     */
    private needProcessKeyOperation(
        op: IMapKeyOperation,
        local: boolean,
        localOpMetadata: unknown,
    ): boolean {
        if (this.pendingClearMessageId !== -1) {
            if (local) {
                assert(localOpMetadata !== undefined &&
                    (localOpMetadata as IMapLocalOpMetadata).pendingMessageId < this.pendingClearMessageId,
                    0x013 /* "Received out of order op when there is an unackd clear message" */);
            }
            // If we have an unack'd clear, we can ignore all ops.
            return false;
        }

        if (this.pendingKeys.has(op.key)) {
            // Found an unack'd op. Clear it from the map if the pendingMessageId in the map matches this message's
            // and don't process the op.
            if (local) {
                assert(localOpMetadata !== undefined,
                    0x014 /* `pendingMessageId is missing from the local client's ${op.type} operation` */);
                const pendingMessage = localOpMetadata as IMapLocalOpMetadata;
                const pendingMetadata = this.pendingKeys.get(op.key);
                if (pendingMetadata !== undefined) {
                    const index = pendingMetadata.findIndex(
                        (value) => value.pendingMessageId === pendingMessage.pendingMessageId);
                    if (index === pendingMetadata.length - 1) {
                        // Remove the key if it was the latest pending message for the key
                        this.pendingKeys.delete(op.key);
                    } else if (index !== -1) {
                        // Keep only the pending messages set after the op
                        this.pendingKeys.set(op.key, pendingMetadata.slice(index + 1));
                    }
                }
            }
            return false;
        }

        // If we don't have a NACK op on the key, we need to process the remote ops.
        return !local;
    }

    /**
     * Get the message handlers for the map.
     * @returns A map of string op names to IMapMessageHandlers for those ops
     */
    private getMessageHandlers() {
        const messageHandlers = new Map<string, IMapMessageHandler>();
        messageHandlers.set(
            "clear",
            {
                process: (op: IMapClearOperation, local, localOpMetadata) => {
                    if (local) {
                        assert(localOpMetadata !== undefined,
                            0x015 /* "pendingMessageId is missing from the local client's clear operation" */);
                        const pendingMessageId = localOpMetadata as number;
                        if (this.pendingClearMessageId === pendingMessageId) {
                            this.pendingClearMessageId = -1;
                        }
                        return;
                    }
                    if (this.pendingKeys.size !== 0) {
                        this.clearExceptPendingKeys();
                        return;
                    }
                    this.clearCore(local);
                },
                submit: (op: IMapClearOperation, localOpMetadata: unknown) => {
                    // We don't reuse the metadata but send a new one on each submit.
                    this.submitMapClearMessage(op);
                },
                getStashedOpLocalMetadata: (op: IMapClearOperation) => {
                    // We don't reuse the metadata but send a new one on each submit.
                    return this.getMapClearMessageLocalMetadata(op);
                },
            });
        messageHandlers.set(
            "delete",
            {
                process: (op: IMapDeleteOperation, local, localOpMetadata) => {
                    if (!this.needProcessKeyOperation(op, local, localOpMetadata)) {
                        return;
                    }
                    this.deleteCore(op.key, local);
                },
                submit: (op: IMapDeleteOperation, localOpMetadata: unknown) => {
                    // We don't reuse the metadata but send a new one on each submit.
                    this.submitMapKeyMessage(op, localOpMetadata);
                },
                getStashedOpLocalMetadata: (op: IMapDeleteOperation) => {
                    // We don't reuse the metadata but send a new one on each submit.
                    return this.getMapKeyMessageLocalMetadataWithPendingValue(op);
                },
            });
        messageHandlers.set(
            "set",
            {
                process: (op: IMapSetOperation, local, localOpMetadata) => {
                    if (!this.needProcessKeyOperation(op, local, localOpMetadata)) {
                        return;
                    }

                    // needProcessKeyOperation should have returned false if local is true
                    const context = this.makeLocal(op.key, op.value);
                    this.setCore(op.key, context, local);
                },
                submit: (op: IMapSetOperation, localOpMetadata: unknown) => {
                    // We don't reuse the metadata but send a new one on each submit.
                    this.submitMapKeyMessage(op, localOpMetadata);
                },
                getStashedOpLocalMetadata: (op: IMapSetOperation) => {
                    // We don't reuse the metadata but send a new one on each submit.
                    return this.getMapKeyMessageLocalMetadataWithPendingValue(op);
                },
            });

        return messageHandlers;
    }

    private getMapClearMessageLocalMetadata(op: IMapClearOperation): number {
        const pendingMessageId = ++this.pendingMessageId;
        this.pendingClearMessageId = pendingMessageId;
        return pendingMessageId;
    }

    /**
     * Submit a clear message to remote clients.
     * @param op - The clear message
     */
    private submitMapClearMessage(op: IMapClearOperation): void {
        const pendingMessageId = this.getMapClearMessageLocalMetadata(op);
        this.submitMessage(op, pendingMessageId);
    }

    private getMapKeyMessageLocalMetadataWithPendingValue(op: IMapKeyOperation): unknown {
        const previous = this.pendingKeys.get(op.key);
        return this.getMapKeyMessageLocalMetadata(op,
            previous ? previous[previous.length - 1].previousValue : undefined);
    }

    private getMapKeyMessageLocalMetadata(op: IMapKeyOperation, previousValue: any): unknown {
        const pendingMessageId = ++this.pendingMessageId;
        const localMetadata = { pendingMessageId, previousValue };
        const pendingMetadata = this.pendingKeys.get(op.key);
        if (pendingMetadata !== undefined) {
            pendingMetadata.push(localMetadata);
        } else {
            this.pendingKeys.set(op.key, [localMetadata]);
        }
        return localMetadata;
    }

    /**
     * Submit a map key message to remote clients.
     * @param op - The map key message
     */
    private submitMapKeyMessage(op: IMapKeyOperation, previousValue: any): void {
        const localMetadata = this.getMapKeyMessageLocalMetadata(op, previousValue);
        this.submitMessage(op, localMetadata);
    }
}

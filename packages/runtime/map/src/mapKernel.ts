/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import { strongAssert } from "@fluidframework/runtime-utils";
import { makeHandlesSerializable, parseHandles, ValueType } from "@fluidframework/shared-object-base";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
    ISerializableValue,
    ISerializedValue,
    IValueChanged,
    IValueOpEmitter,
    IValueType,
    IValueTypeOperationValue,
    ISharedMapEvents,
} from "./interfaces";
import {
    ILocalValue,
    LocalValueMaker,
    makeSerializable,
    ValueTypeLocalValue,
} from "./localValues";

/**
 * Defines the means to process and submit a given op on a map.
 */
interface IMapMessageHandler {
    /**
     * Apply the given operation.
     * @param op - The map operation to apply
     * @param local - Whether the message originated from the local client
     * @param message - The full message
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     */
    process(op: IMapOperation, local: boolean, message: ISequencedDocumentMessage, localOpMetadata: unknown): void;

    /**
     * Communicate the operation to remote clients.
     * @param op - The map operation to submit
     * @param localOpMetadata - The metadata to be submitted with the message.
     */
    submit(op: IMapOperation, localOpMetadata: unknown): void;
}

/**
 * Describes an operation specific to a value type.
 */
interface IMapValueTypeOperation {
    /**
     * String identifier of the operation type.
     */
    type: "act";

    /**
     * Map key being modified.
     */
    key: string;

    /**
     * Value of the operation, specific to the value type.
     */
    value: IValueTypeOperationValue;
}

/**
 * Operation indicating a value should be set for a key.
 */
interface IMapSetOperation {
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
interface IMapDeleteOperation {
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
type IMapKeyOperation = IMapValueTypeOperation | IMapSetOperation | IMapDeleteOperation;

/**
 * Operation indicating the map should be cleared.
 */
interface IMapClearOperation {
    /**
     * String identifier of the operation type.
     */
    type: "clear";
}

/**
 * Description of a map delta operation
 */
type IMapOperation = IMapKeyOperation | IMapClearOperation;

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
    private readonly pendingKeys: Map<string, number> = new Map();

    /**
     * This is used to assign a unique id to every outgoing operation and helps in tracking unack'd ops.
     */
    private pendingMessageId: number = 0;

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
     * @param runtime - The component runtime the shared object using the kernel will be associated with
     * @param handle - The handle of the shared object using the kernel
     * @param submitMessage - A callback to submit a message through the shared object
     * @param valueTypes - The value types to register
     * @param eventEmitter - The object that will emit map events
     */
    constructor(
        private readonly runtime: IComponentRuntime,
        private readonly handle: IComponentHandle,
        private readonly submitMessage: (op: any, localOpMetadata: unknown) => number,
        valueTypes: Readonly<IValueType<any>[]>,
        public readonly eventEmitter = new TypedEventEmitter<ISharedMapEvents>(),
    ) {
        this.localValueMaker = new LocalValueMaker(runtime);
        this.messageHandlers = this.getMessageHandlers();
        for (const type of valueTypes) {
            this.localValueMaker.registerValueType(type);
        }
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
    public get<T = any>(key: string): T {
        if (!this.data.has(key)) {
            return undefined;
        }

        const localValue = this.data.get(key);

        return localValue.value as T;
    }

    /**
     * {@inheritDoc ISharedMap.wait}
     */
    public async wait<T = any>(key: string): Promise<T> {
        // Return immediately if the value already exists
        if (this.has(key)) {
            return this.get<T>(key);
        }

        // Otherwise subscribe to changes
        return new Promise<T>((resolve) => {
            const callback = (changed: IValueChanged) => {
                if (key === changed.key) {
                    resolve(this.get<T>(changed.key));
                    this.eventEmitter.removeListener("valueChanged", callback);
                }
            };

            this.eventEmitter.on("valueChanged", callback);
        });
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

        const localValue = this.localValueMaker.fromInMemory(value);
        const serializableValue = makeSerializable(
            localValue,
            this.runtime.IComponentSerializer,
            this.runtime.IComponentHandleContext,
            this.handle);

        this.setCore(
            key,
            localValue,
            true,
            null,
        );

        const op: IMapSetOperation = {
            key,
            type: "set",
            value: serializableValue,
        };
        this.submitMapKeyMessage(op);
    }

    /**
     * {@inheritDoc IValueTypeCreator.createValueType}
     */
    public createValueType(key: string, type: string, params: any) {
        const localValue = this.localValueMaker.makeValueType(type, this.makeMapValueOpEmitter(key), params);

        // TODO ideally we could use makeSerialized in this case as well. But the interval
        // collection has assumptions of attach being called prior. Given the IComponentSerializer it
        // may be possible to remove custom value type serialization entirely.
        const transformedValue = makeHandlesSerializable(
            params,
            this.runtime.IComponentSerializer,
            this.runtime.IComponentHandleContext,
            this.handle);

        // This is a special form of serialized valuetype only used for set, containing info for initialization.
        // After initialization, the serialized form will need to come from the .store of the value type's factory.
        const serializableValue = { type, value: transformedValue };

        this.setCore(
            key,
            localValue,
            true,
            null,
        );

        const op: IMapSetOperation = {
            key,
            type: "set",
            value: serializableValue,
        };
        this.submitMapKeyMessage(op);
    }

    /**
     * Delete a key from the map.
     * @param key - Key to delete
     * @returns True if the key existed and was deleted, false if it did not exist
     */
    public delete(key: string): boolean {
        const op: IMapDeleteOperation = {
            key,
            type: "delete",
        };

        const successfullyRemoved = this.deleteCore(op.key, true, null);
        this.submitMapKeyMessage(op);
        return successfullyRemoved;
    }

    /**
     * Clear all data from the map.
     */
    public clear(): void {
        const op: IMapClearOperation = {
            type: "clear",
        };

        this.clearCore(true, null);
        this.submitMapClearMessage(op);
    }

    /**
     * Serializes the data stored in the shared map to a JSON string
     * @returns A JSON string containing serialized map data
     */
    public getSerializedStorage(): IMapDataObjectSerialized {
        const serializableMapData: IMapDataObjectSerialized = {};
        this.data.forEach((localValue, key) => {
            serializableMapData[key] = localValue.makeSerialized(
                this.runtime.IComponentSerializer,
                this.runtime.IComponentHandleContext,
                this.handle);
        });
        return serializableMapData;
    }

    public getSerializableStorage(): IMapDataObjectSerializable {
        const serializableMapData: IMapDataObjectSerializable = {};
        this.data.forEach((localValue, key) => {
            serializableMapData[key] = makeSerializable(
                localValue,
                this.runtime.IComponentSerializer,
                this.runtime.IComponentHandleContext,
                this.handle);
        });
        return serializableMapData;
    }

    public serialize(): string {
        return JSON.stringify(this.getSerializableStorage());
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
            this.messageHandlers.get(type).submit(op as IMapOperation, localOpMetadata);
            return true;
        }
        return false;
    }

    /**
     * Process the given op if a handler is registered.
     * @param message - The message to process
     * @param local - Whether the message originated from the local client
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     * @returns True if the operation was processed, false otherwise.
     */
    public tryProcessMessage(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): boolean {
        const op = message.contents as IMapOperation;
        if (this.messageHandlers.has(op.type)) {
            this.messageHandlers
                .get(op.type)
                .process(op, local, message, localOpMetadata);
            return true;
        }
        return false;
    }

    /**
     * Set implementation used for both locally sourced sets as well as incoming remote sets.
     * @param key - The key being set
     * @param value - The value being set
     * @param local - Whether the message originated from the local client
     * @param op - The message if from a remote set, or null if from a local set
     */
    private setCore(key: string, value: ILocalValue, local: boolean, op: ISequencedDocumentMessage): void {
        const previousValue = this.get(key);
        this.data.set(key, value);
        const event: IValueChanged = { key, previousValue };
        this.eventEmitter.emit("valueChanged", event, local, op, this);
    }

    /**
     * Clear implementation used for both locally sourced clears as well as incoming remote clears.
     * @param local - Whether the message originated from the local client
     * @param op - The message if from a remote clear, or null if from a local clear
     */
    private clearCore(local: boolean, op: ISequencedDocumentMessage): void {
        this.data.clear();
        this.eventEmitter.emit("clear", local, op, this);
    }

    /**
     * Delete implementation used for both locally sourced deletes as well as incoming remote deletes.
     * @param key - The key being deleted
     * @param local - Whether the message originated from the local client
     * @param op - The message if from a remote delete, or null if from a local delete
     * @returns True if the key existed and was deleted, false if it did not exist
     */
    private deleteCore(key: string, local: boolean, op: ISequencedDocumentMessage): boolean {
        const previousValue = this.get(key);
        const successfullyRemoved = this.data.delete(key);
        if (successfullyRemoved) {
            const event: IValueChanged = { key, previousValue };
            this.eventEmitter.emit("valueChanged", event, local, op, this);
        }
        return successfullyRemoved;
    }

    /**
     * Clear all keys in memory in response to a remote clear, but retain keys we have modified but not yet been ack'd.
     */
    private clearExceptPendingKeys(): void {
        // Assuming the pendingKeys is small and the map is large
        // we will get the value for the pendingKeys and clear the map
        const temp = new Map<string, ILocalValue>();
        this.pendingKeys.forEach((value, key) => {
            temp.set(key, this.data.get(key));
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
            return this.localValueMaker.fromSerializable(
                serializable,
                this.makeMapValueOpEmitter(key),
            );
        }
    }

    /**
     * If our local operations that have not yet been ack'd will eventually overwrite an incoming operation, we should
     * not process the incoming operation.
     * @param op - Operation to check
     * @param local - Whether the message originated from the local client
     * @param message - The message
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     * @returns True if the operation should be processed, false otherwise
     */
    private needProcessKeyOperation(
        op: IMapKeyOperation,
        local: boolean,
        message: ISequencedDocumentMessage,
        localOpMetadata: unknown,
    ): boolean {
        if (this.pendingClearMessageId !== -1) {
            if (local) {
                strongAssert(localOpMetadata !== undefined && localOpMetadata as number < this.pendingClearMessageId,
                    "Received out of order op when there is an unackd clear message");
            }
            // If we have an unack'd clear, we can ignore all ops.
            return false;
        }

        if (this.pendingKeys.has(op.key)) {
            // Found an unack'd op. Clear it from the map if the pendingMessageId in the map matches this message's
            // and don't process the op.
            if (local) {
                strongAssert(localOpMetadata !== undefined,
                    `pendingMessageId is missing from the local client's ${op.type} operation`);
                const pendingMessageId = localOpMetadata as number;
                const pendingKeyMessageId = this.pendingKeys.get(op.key);
                if (pendingKeyMessageId === pendingMessageId) {
                    this.pendingKeys.delete(op.key);
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
                process: (op: IMapClearOperation, local, message, localOpMetadata) => {
                    if (local) {
                        strongAssert(localOpMetadata !== undefined,
                            "pendingMessageId is missing from the local client's clear operation");
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
                    this.clearCore(local, message);
                },
                submit: (op: IMapClearOperation, localOpMetadata: unknown) => {
                    // We don't reuse the metadata but send a new one on each submit.
                    this.submitMapClearMessage(op);
                },
            });
        messageHandlers.set(
            "delete",
            {
                process: (op: IMapDeleteOperation, local, message, localOpMetadata) => {
                    if (!this.needProcessKeyOperation(op, local, message, localOpMetadata)) {
                        return;
                    }
                    this.deleteCore(op.key, local, message);
                },
                submit: (op: IMapDeleteOperation, localOpMetadata: unknown) => {
                    // We don't reuse the metadata but send a new one on each submit.
                    this.submitMapKeyMessage(op);
                },
            });
        messageHandlers.set(
            "set",
            {
                process: (op: IMapSetOperation, local, message, localOpMetadata) => {
                    if (!this.needProcessKeyOperation(op, local, message, localOpMetadata)) {
                        return;
                    }

                    const context = local ? undefined : this.makeLocal(op.key, op.value);

                    this.setCore(op.key, context, local, message);
                },
                submit: (op: IMapSetOperation, localOpMetadata: unknown) => {
                    // We don't reuse the metadata but send a new one on each submit.
                    this.submitMapKeyMessage(op);
                },
            });

        // Ops with type "act" describe actions taken by custom value type handlers of whatever item is
        // being addressed.  These custom handlers can be retrieved from the ValueTypeLocalValue which has
        // stashed its valueType (and therefore its handlers).  We also emit a valueChanged for anyone
        // watching for manipulations of that item.
        messageHandlers.set(
            "act",
            {
                process: (op: IMapValueTypeOperation, local, message, localOpMetadata) => {
                    // Local value might not exist if we deleted it
                    const localValue = this.data.get(op.key) as ValueTypeLocalValue;
                    if (!localValue) {
                        return;
                    }

                    const handler = localValue.getOpHandler(op.value.opName);
                    const previousValue = localValue.value;
                    const translatedValue = parseHandles(
                        op.value.value,
                        this.runtime.IComponentSerializer,
                        this.runtime.IComponentHandleContext);
                    handler.process(previousValue, translatedValue, local, message);
                    const event: IValueChanged = { key: op.key, previousValue };
                    this.eventEmitter.emit("valueChanged", event, local, message, this);
                },
                submit: (op: IMapValueTypeOperation, localOpMetadata: unknown) => {
                    this.submitMessage(op, localOpMetadata);
                },
            });

        return messageHandlers;
    }

    /**
     * Submit a clear message to remote clients.
     * @param op - The clear message
     */
    private submitMapClearMessage(op: IMapClearOperation): void {
        if (this.submitMessage(op, this.pendingMessageId) !== -1) {
            this.pendingClearMessageId = this.pendingMessageId++;
        }
    }

    /**
     * Submit a map key message to remote clients.
     * @param op - The map key message
     */
    private submitMapKeyMessage(op: IMapKeyOperation): void {
        if (this.submitMessage(op, this.pendingMessageId) !== -1) {
            this.pendingKeys.set(op.key, this.pendingMessageId++);
        }
    }

    /**
     * Create an emitter for a value type to emit ops from the given key.
     * @alpha
     * @param key - The key of the map that the value type will be stored on
     * @returns A value op emitter for the given key
     */
    private makeMapValueOpEmitter(key: string): IValueOpEmitter {
        const emit = (opName: string, previousValue: any, params: any) => {
            const translatedParams = makeHandlesSerializable(
                params,
                this.runtime.IComponentSerializer,
                this.runtime.IComponentHandleContext,
                this.handle);

            const op: IMapValueTypeOperation = {
                key,
                type: "act",
                value: {
                    opName,
                    value: translatedParams,
                },
            };
            // Send the localOpMetadata as undefined because we don't care about the ack.
            this.submitMessage(op, undefined /* localOpMetadata */);

            const event: IValueChanged = { key, previousValue };
            this.eventEmitter.emit("valueChanged", event, true, null, this);
        };

        return { emit };
    }
}

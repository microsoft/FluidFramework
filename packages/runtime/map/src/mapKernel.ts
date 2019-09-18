/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "@prague/component-core-interfaces";
import {
    ISequencedDocumentMessage,
} from "@prague/protocol-definitions";
import {
    IComponentRuntime,
} from "@prague/runtime-definitions";
import {
    parseHandles,
    serializeHandles,
    ValueType,
} from "@prague/shared-object-common";
import { EventEmitter } from "events";
import {
    ISerializableValue,
    IValueChanged,
    IValueOpEmitter,
    IValueType,
    IValueTypeOperationValue,
} from "./interfaces";
import {
    ILocalValue,
    LocalValueMaker,
    ValueTypeLocalValue,
} from "./localValues";

interface IMapMessageHandler {
    process(op: IMapOperation, local: boolean, message: ISequencedDocumentMessage): void;
    submit(op: IMapOperation): void;
}

interface IMapValueTypeOperation {
    type: "act";
    key: string;
    value: IValueTypeOperationValue;
}

interface IMapSetOperation {
    type: "set";
    key: string;
    value: ISerializableValue;
}

interface IMapDeleteOperation {
    type: "delete";
    key: string;
}

type IMapKeyOperation = IMapValueTypeOperation | IMapSetOperation | IMapDeleteOperation;

interface IMapClearOperation {
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
export interface IMapDataObject {
    [key: string]: ISerializableValue;
}

/**
 * A SharedMap is a map-like distributed data structure.
 */
export class MapKernel {

    public get size() {
        return this.data.size;
    }
    private readonly messageHandlers: ReadonlyMap<string, IMapMessageHandler> = new Map();

    private readonly data = new Map<string, ILocalValue>();
    private readonly pendingKeys: Map<string, number> = new Map();
    private pendingClearClientSequenceNumber: number = -1;
    private readonly localValueMaker: LocalValueMaker;

    /**
     * Constructs a new shared map. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(
        private readonly runtime: IComponentRuntime,
        private readonly handle: IComponentHandle,
        private readonly submitMessage: (op: any) => number,
        valueTypes: Readonly<IValueType<any>[]>,
        public readonly eventEmitter = new EventEmitter(),
    ) {
        this.localValueMaker = new LocalValueMaker(runtime);
        this.messageHandlers = this.setMessageHandlers();
        for (const type of valueTypes) {
            this.localValueMaker.registerValueType(type);
        }
    }

    public keys(): IterableIterator<string> {
        return this.data.keys();
    }

    public entries(): IterableIterator<[string, any]> {
        const localEntriesIterator = this.data.entries();
        const iterator = {
            next(): IteratorResult<[string, any]> {
                const nextVal = localEntriesIterator.next();
                if (nextVal.done) {
                    return { value: undefined, done: true };
                } else {
                    // unpack the stored value
                    // tslint:disable-next-line: no-unsafe-any
                    return { value: [nextVal.value[0], nextVal.value[1].value], done: false };
                }
            },
            [Symbol.iterator]() {
                return this;
            },
        };
        return iterator;
    }

    public values(): IterableIterator<any> {
        const localValuesIterator = this.data.values();
        const iterator = {
            next(): IteratorResult<any> {
                const nextVal = localValuesIterator.next();
                if (nextVal.done) {
                    return { value: undefined, done: true };
                } else {
                    // unpack the stored value
                    // tslint:disable-next-line: no-unsafe-any
                    return { value: nextVal.value.value, done: false };
                }
            },
            [Symbol.iterator]() {
                return this;
            },
        };
        return iterator;
    }

    public [Symbol.iterator](): IterableIterator<[string, any]> {
        return this.entries();
    }

    // TODO: fix to pass-through when meta-data moved to separate map
    public forEach(callbackFn: (value: any, key: string, map: Map<string, any>) => void) {
        this.data.forEach((localValue, key, m) => {
            callbackFn(localValue.value, key, m);
        });
    }

    /**
     * Retrieves the value with the given key from the map.
     */
    public get<T = any>(key: string): T {
        if (!this.data.has(key)) {
            return undefined;
        }

        // Let's stash the *type* of the object on the key
        const localValue = this.data.get(key);

        return localValue.value as T;
    }

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

    public has(key: string): boolean {
        return this.data.has(key);
    }

    /**
     * Public set API.
     * @param key - key to set
     * @param value - value to set
     */
    public set(key: string, value: any) {
        const localValue = this.localValueMaker.fromInMemory(value);
        const serializableValue = localValue.makeSerializable(
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

        // TODO ideally we could use makeSerializable in this case as well. But the interval
        // collection has assumptions of attach being called prior. Given the IComponentSerializer it
        // may be possible to remove custom value type serialization entirely.
        const transformedValue = serializeHandles(
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
     * Public delete API.
     * @param key - key to delete
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
     * Public clear API.
     */
    public clear(): void {
        const op: IMapClearOperation = {
            type: "clear",
        };

        this.clearCore(true, null);
        this.submitMapClearMessage(op);
    }

    /**
     * Serializes the shared map to a JSON string
     */
    public serialize(): string {
        const serializableMapData: IMapDataObject = {};
        this.data.forEach((localValue, key) => {
            serializableMapData[key] = localValue.makeSerializable(
                this.runtime.IComponentSerializer,
                this.runtime.IComponentHandleContext,
                this.handle);
        });
        return JSON.stringify(serializableMapData);
    }

    public populate(data: IMapDataObject): void {
        for (const [key, serializable] of Object.entries(data)) {
            const localValue = {
                key,
                value: this.makeLocal(key, serializable),
            };

            this.data.set(localValue.key, localValue.value);
        }
    }

    public hasHandlerFor(message: any): boolean {
        // tslint:disable-next-line:no-unsafe-any
        return this.messageHandlers.has(message.type);
    }

    public trySubmitMessage(message: any): boolean {
        // tslint:disable-next-line:no-unsafe-any
        const type: string = message.type;
        if (this.messageHandlers.has(type)) {
            this.messageHandlers
                .get(type)
                .submit(message as IMapOperation);
            return true;
        }
        return false;
    }

    public tryProcessMessage(message: ISequencedDocumentMessage, local: boolean): boolean {
        // tslint:disable-next-line:no-unsafe-any
        const type: string = message.type;
        if (this.messageHandlers.has(type)) {
            const op = message.contents as IMapOperation;
            this.messageHandlers
                .get(type)
                .process(op, local, message);
            return true;
        }
        return false;
    }

    private setCore(key: string, value: ILocalValue, local: boolean, op: ISequencedDocumentMessage) {
        const previousValue = this.get(key);
        this.data.set(key, value);
        const event: IValueChanged = { key, previousValue };
        this.eventEmitter.emit("valueChanged", event, local, op, this);
    }

    private clearCore(local: boolean, op: ISequencedDocumentMessage) {
        this.data.clear();
        this.eventEmitter.emit("clear", local, op, this);
    }

    private deleteCore(key: string, local: boolean, op: ISequencedDocumentMessage) {
        const previousValue = this.get(key);
        const successfullyRemoved = this.data.delete(key);
        if (successfullyRemoved) {
            const event: IValueChanged = { key, previousValue };
            this.eventEmitter.emit("valueChanged", event, local, op, this);
        }
        return successfullyRemoved;
    }

    private clearExceptPendingKeys(pendingKeys: Map<string, number>) {
        // Assuming the pendingKeys is small and the map is large
        // we will get the value for the pendingKeys and clear the map
        const temp = new Map<string, ILocalValue>();
        pendingKeys.forEach((value, key) => {
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
     * @param key - the key that the caller intends to store the local value into (used for ops later).  But
     * doesn't actually store the local value into that key.  So better not lie!
     * @param serializable - the remote information that we can convert into a real object
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

    private needProcessKeyOperations(
        op: IMapKeyOperation,
        local: boolean,
        message: ISequencedDocumentMessage,
    ): boolean {
        if (this.pendingClearClientSequenceNumber !== -1) {
            // If I have a NACK clear, we can ignore all ops.
            return false;
        }

        if ((this.pendingKeys.size !== 0 && this.pendingKeys.has(op.key))) {
            // Found an NACK op, clear it from the map if the latest sequence number in the map match the message's
            // and don't process the op.
            if (local) {
                const pendingKeyClientSequenceNumber = this.pendingKeys.get(op.key);
                if (pendingKeyClientSequenceNumber === message.clientSequenceNumber) {
                    this.pendingKeys.delete(op.key);
                }
            }
            return false;
        }

        // If we don't have a NACK op on the key, we need to process the remote ops.
        return !local;
    }

    private setMessageHandlers() {
        const messageHandlers = new Map<string, IMapMessageHandler>();
        messageHandlers.set(
            "clear",
            {
                process: (op: IMapClearOperation, local, message) => {
                    if (local) {
                        if (this.pendingClearClientSequenceNumber === message.clientSequenceNumber) {
                            this.pendingClearClientSequenceNumber = -1;
                        }
                        return;
                    }
                    if (this.pendingKeys.size !== 0) {
                        this.clearExceptPendingKeys(this.pendingKeys);
                        return;
                    }
                    this.clearCore(local, message);
                },
                submit: (op: IMapClearOperation) => {
                    this.submitMapClearMessage(op);
                },
            });
        messageHandlers.set(
            "delete",
            {
                process: (op: IMapDeleteOperation, local, message) => {
                    if (!this.needProcessKeyOperations(op, local, message)) {
                        return;
                    }
                    this.deleteCore(op.key, local, message);
                },
                submit: (op: IMapDeleteOperation) => {
                    this.submitMapKeyMessage(op);
                },
            });
        messageHandlers.set(
            "set",
            {
                process: (op: IMapSetOperation, local, message) => {
                    if (!this.needProcessKeyOperations(op, local, message)) {
                        return;
                    }

                    const context = local ? undefined : this.makeLocal(op.key, op.value);

                    this.setCore(op.key, context, local, message);
                },
                submit: (op: IMapSetOperation) => {
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
                process: (op: IMapValueTypeOperation, local, message) => {
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
                submit: this.submitMessage,
            });

        return messageHandlers;
    }

    private submitMapClearMessage(op: IMapClearOperation): void {
        const clientSequenceNumber = this.submitMessage(op);
        if (clientSequenceNumber !== -1) {
            this.pendingClearClientSequenceNumber = clientSequenceNumber;
        }
    }

    private submitMapKeyMessage(op: IMapKeyOperation): void {
        const clientSequenceNumber = this.submitMessage(op);
        if (clientSequenceNumber !== -1) {
            this.pendingKeys.set(op.key, clientSequenceNumber);
        }
    }

    private makeMapValueOpEmitter(key: string): IValueOpEmitter {
        const emit = (opName: string, previousValue: any, params: any) => {
            const translatedParams = serializeHandles(
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
            this.submitMessage(op);

            const event: IValueChanged = { key, previousValue };
            this.eventEmitter.emit("valueChanged", event, true, null, this);
        };

        return { emit };
    }
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry,
} from "@prague/protocol-definitions";
import {
    IChannelAttributes,
    IComponentRuntime,
    IObjectStorageService,
    ISharedObjectServices,
} from "@prague/runtime-definitions";
import {
    ISharedObjectFactory,
    parseHandles,
    serializeHandles,
    SharedObject,
    ValueType,
} from "@prague/shared-object-common";
import { fromBase64ToUtf8 } from "@prague/utils";
import { debug } from "./debug";
import {
    ISerializableValue,
    ISharedMap,
    IValueChanged,
    IValueOpEmitter,
    IValueType,
    IValueTypeOperationValue,
} from "./interfaces";
import {
    ILocalValue,
    LocalValueMaker,
    ValueTypeLocalValue,
    valueTypes,
} from "./localValues";
import { pkgVersion } from "./packageVersion";

const snapshotFileName = "header";
const contentPath = "content";

class ContentObjectStorage implements IObjectStorageService {
    constructor(private readonly storage: IObjectStorageService) {
    }

    /* tslint:disable:promise-function-async */
    public read(path: string): Promise<string> {
        return this.storage.read(`${contentPath}/${path}`);
    }
}

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
interface IMapDataObject {
    [key: string]: ISerializableValue;
}

/**
 * The factory that defines the map
 */
export class MapFactory implements ISharedObjectFactory {
    public static readonly Type = "https://graph.microsoft.com/types/map";

    public static readonly Attributes: IChannelAttributes = {
        type: MapFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public get type() {
        return MapFactory.Type;
    }

    public get attributes() {
        return MapFactory.Attributes;
    }

    public async load(
        runtime: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string): Promise<ISharedMap> {

        const map = new SharedMap(id, runtime);
        await map.load(branchId, services);

        return map;
    }

    public create(runtime: IComponentRuntime, id: string): ISharedMap {
        const map = new SharedMap(id, runtime);
        map.initializeLocal();

        return map;
    }
}

/**
 * A SharedMap is a map-like distributed data structure.
 */
export class SharedMap extends SharedObject implements ISharedMap {
    /**
     * Create a new shared map
     *
     * @param runtime - component runtime the new shared map belongs to
     * @param id - optional name of the shared map
     * @returns newly create shared map (but not attached yet)
     */
    public static create(runtime: IComponentRuntime, id?: string): SharedMap {
        return runtime.createChannel(SharedObject.getIdForCreate(id), MapFactory.Type) as SharedMap;
    }

    /**
     * Get a factory for SharedMap to register with the component.
     *
     * @returns a factory that creates and load SharedMap
     */
    public static getFactory(): ISharedObjectFactory {
        return new MapFactory();
    }

    public readonly [Symbol.toStringTag]: string = "SharedMap";
    private readonly data = new Map<string, ILocalValue>();
    private readonly messageHandlers: Map<string, IMapMessageHandler> = new Map();
    private readonly pendingKeys: Map<string, number> = new Map();
    private pendingClearClientSequenceNumber: number = -1;
    private readonly localValueMaker: LocalValueMaker;

    /**
     * Constructs a new shared map. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(
        id: string,
        runtime: IComponentRuntime,
        attributes = MapFactory.Attributes,
    ) {
        super(id, runtime, attributes);
        this.localValueMaker = new LocalValueMaker(runtime);
        this.setMessageHandlers();
        for (const type of valueTypes) {
            this.registerValueType(type);
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

    public get size() {
        return this.data.size;
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
        return new Promise<T>((resolve, reject) => {
            const callback = (changed: IValueChanged) => {
                if (key === changed.key) {
                    resolve(this.get<T>(changed.key));
                    this.removeListener("valueChanged", callback);
                }
            };

            this.on("valueChanged", callback);
        });
    }

    public has(key: string): boolean {
        return this.data.has(key);
    }

    /**
     * Public set API.  Type must be passed if setting a value type.
     * @param key - key to set
     * @param value - value to set (or initialization params if value type)
     * @param type - type getting set (if value type)
     */
    public set(key: string, value: any, type?: string): this {
        let localValue: ILocalValue;
        let serializableValue: ISerializableValue;
        if (type) {
            // value is actually initialization params in the value type case
            localValue = this.localValueMaker.makeValueType(type, this.makeMapValueOpEmitter(key), value);

            // TODO ideally we could use makeSerializable in this case as well. But the interval
            // collection has assumptions of attach being called prior. Given the IComponentSerializer it
            // may be possible to remove custom value type serialization entirely.
            const transformedValue = serializeHandles(
                value,
                this.runtime.IComponentSerializer,
                this.runtime.IComponentHandleContext,
                this.handle);

            // This is a special form of serialized valuetype only used for set, containing info for initialization.
            // After initialization, the serialized form will need to come from the .store of the value type's factory.
            serializableValue = { type, value: transformedValue };
        } else {
            localValue = this.localValueMaker.fromInMemory(value);
            serializableValue = localValue.makeSerializable(
                this.runtime.IComponentSerializer,
                this.runtime.IComponentHandleContext,
                this.handle);
        }

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
        return this;
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

    public snapshot(): ITree {
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: this.serialize(),
                        encoding: "utf-8",
                    },
                },
            ],
            id: null,
        };

        // Add the snapshot of the content to the tree
        const contentSnapshot = this.snapshotContent();
        if (contentSnapshot) {
            tree.entries.push({
                mode: FileMode.Directory,
                path: contentPath,
                type: TreeEntry[TreeEntry.Tree],
                value: contentSnapshot,
            });
        }

        return tree;
    }

    /**
     * Registers a listener on the specified events
     */
    public on(
        event: "pre-op" | "op",
        listener: (op: ISequencedDocumentMessage, local: boolean, target: this) => void): this;
    public on(event: "valueChanged", listener: (
        changed: IValueChanged,
        local: boolean,
        op: ISequencedDocumentMessage,
        target: this) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this;

    /* tslint:disable:no-unnecessary-override */
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
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

    protected onDisconnect() {
        debug(`Map ${this.id} is now disconnected`);
        this.onDisconnectContent();
    }

    protected onConnect(pending: any[]) {
        debug(`Map ${this.id} is now connected`);
        // REVIEW: Does it matter that the map and content message get out of order?

        // Filter the nonAck and pending messages into a map set and a content set.
        const mapMessages: IMapOperation[] = [];
        const contentMessages: any[] = [];
        for (const message of pending) {
            if (this.hasHandlerFor(message)) {
                mapMessages.push(message as IMapOperation);
            } else {
                contentMessages.push(message);
            }
        }

        // Deal with the map messages - for the map it's always last one wins so we just resend
        for (const message of mapMessages) {
            const handler = this.messageHandlers.get(message.type);
            handler.submit(message);
        }

        // Allow content to catch up
        this.onConnectContent(contentMessages);
    }

    protected async loadCore(
        branchId: string,
        storage: IObjectStorageService) {

        const header = await storage.read(snapshotFileName);

        const data = header ? JSON.parse(fromBase64ToUtf8(header)) : {};
        this.populate(data as IMapDataObject);

        const contentStorage = new ContentObjectStorage(storage);
        await this.loadContent(
            branchId,
            contentStorage);
    }

    protected async loadContent(
        branchId: string,
        services: IObjectStorageService): Promise<void> {
        return;
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean) {
        let handled = false;
        if (message.type === MessageType.Operation) {
            const op: IMapOperation = message.contents as IMapOperation;
            if (this.messageHandlers.has(op.type)) {
                this.messageHandlers.get(op.type)
                    .process(op, local, message);
                handled = true;
            }
        }

        if (!handled) {
            this.processContent(message, local);
        }
    }

    protected registerCore() {
        for (const value of this.values()) {
            if (SharedObject.is(value)) {
                value.register();
            }
        }

        this.registerContent();
    }

    // The following three methods enable derived classes to provide custom content that is stored
    // with the map

    protected registerContent() {
        return;
    }

    /**
     * Processes a content message
     */
    protected processContent(message: ISequencedDocumentMessage, local: boolean) {
        return;
    }

    /**
     * Message sent to notify derived content of disconnection
     */
    protected onDisconnectContent() {
        return;
    }

    /**
     * Message sent upon reconnecting to the delta stream
     * Allows Sequence to overwrite nap's default behavior
     */
    protected onConnectContent(pending: any[]) {
        super.onConnect(pending);
    }

    /**
     * Snapshots the content
     */
    protected snapshotContent(): ITree {
        return null;
    }

    /**
     * Registers a new value type on the map
     */
    protected registerValueType<T>(type: IValueType<T>) {
        this.localValueMaker.registerValueType(type);
    }

    private populate(data: IMapDataObject): void {
        for (const [key, serializable] of Object.entries(data)) {
            const localValue = {
                key,
                value: this.makeLocal(key, serializable),
            };

            this.data.set(localValue.key, localValue.value);
        }
    }

    private setCore(key: string, value: ILocalValue, local: boolean, op: ISequencedDocumentMessage) {
        const previousValue = this.get(key);
        this.data.set(key, value);
        const event: IValueChanged = { key, previousValue };
        this.emit("valueChanged", event, local, op, this);
    }

    private clearCore(local: boolean, op: ISequencedDocumentMessage) {
        this.data.clear();
        this.emit("clear", local, op, this);
    }

    private deleteCore(key: string, local: boolean, op: ISequencedDocumentMessage) {
        const previousValue = this.get(key);
        const successfullyRemoved = this.data.delete(key);
        if (successfullyRemoved) {
            const event: IValueChanged = { key, previousValue };
            this.emit("valueChanged", event, local, op, this);
        }
        return successfullyRemoved;
    }

    private clearExceptPendingKeys(pendingKeys: Map<string, number>) {
        // Assuming the pendingKeys is small and the map is large
        // we will get the value for the pendingKeys and clear the map
        const temp = new Map<string, ILocalValue>();
        pendingKeys.forEach((value, key, map) => {
            temp.set(key, this.data.get(key));
        });
        this.data.clear();
        temp.forEach((value, key, map) => {
            this.data.set(key, value);
        });
    }

    private hasHandlerFor(message: any): boolean {
        // tslint:disable-next-line:no-unsafe-any
        return this.messageHandlers.has(message.type);
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
        this.messageHandlers.set(
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
        this.messageHandlers.set(
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
        this.messageHandlers.set(
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
        this.messageHandlers.set(
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
                    this.emit("valueChanged", event, local, message, this);
                },
                submit: (op) => {
                    this.submitLocalMessage(op);
                },
            });
    }

    private submitMapMessage(op: IMapOperation): number {
        return this.submitLocalMessage(op);
    }

    private submitMapClearMessage(op: IMapClearOperation): void {
        const clientSequenceNumber = this.submitMapMessage(op);
        if (clientSequenceNumber !== -1) {
            this.pendingClearClientSequenceNumber = clientSequenceNumber;
        }
    }

    private submitMapKeyMessage(op: IMapKeyOperation): void {
        const clientSequenceNumber = this.submitMapMessage(op);
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
            this.submitMapMessage(op);

            const event: IValueChanged = { key, previousValue };
            this.emit("valueChanged", event, true, null, this);
        };

        return { emit };
    }
}

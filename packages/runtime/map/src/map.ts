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
} from "@prague/container-definitions";
import {
    IComponentRuntime,
    IObjectStorageService,
    ISharedObjectServices,
} from "@prague/runtime-definitions";
import { ISharedObject, ISharedObjectExtension, SharedObject, ValueType } from "@prague/shared-object-common";
import { debug } from "./debug";
import {
    ILocalViewElement,
    ISharedMap,
    IValueChanged,
    IValueOpEmitter,
    IValueOperation,
    IValueType,
} from "./interfaces";

const snapshotFileName = "header";
const contentPath = "content";

/**
 * Copies all values from the provided SharedMap to the given Map
 */
export function copyMap(from: ISharedMap, to: Map<string, any>) {
    from.forEach((value, key) => {
        /* tslint:disable:no-unsafe-any */
        to.set(key, value);
    });
}

class ContentObjectStorage implements IObjectStorageService {
    constructor(private readonly storage: IObjectStorageService) {
    }

    /* tslint:disable:promise-function-async */
    public read(path: string): Promise<string> {
        return this.storage.read(`content/${path}`);
    }
}

class MapValueOpEmitter implements IValueOpEmitter {
    constructor(private readonly type: string, private readonly key: string, private readonly map: SharedMap) {
    }

    public emit(operation: string, previousValue: any, params: any) {
        const op: IMapOperation = {
            key: this.key,
            type: this.type,
            value: {
                type: operation,
                value: params,
            },
        };

        this.map.submitMapMessage(op);
        const event: IValueChanged = { key: this.key, previousValue };
        this.map.emit("valueChanged", event, true, null);
    }
}

interface IMapMessageHandler {
    prepare(op: IMapOperation, local: boolean, message: ISequencedDocumentMessage): Promise<any>;
    process(op: IMapOperation, context: any, local: boolean, message: ISequencedDocumentMessage): void;
    submit(op: IMapOperation);
}

/**
 * Description of a map delta operation
 */
interface IMapOperation {
    type: string;
    key?: string;
    value?: IMapValue;
}

interface IMapValue {
    // The type of the value
    type: string;

    // The actual value
    value: any;
}

/**
 * The extension that defines the map
 */
export class MapExtension implements ISharedObjectExtension {
    public static readonly Type = "https://graph.microsoft.com/types/map";

    public readonly type: string = MapExtension.Type;
    public readonly snapshotFormatVersion: string = "0.1";

    constructor(private readonly defaultValueTypes: Array<IValueType<any>> = []) {
    }

    public async load(
        runtime: IComponentRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: ISharedObjectServices,
        headerOrigin: string): Promise<ISharedMap> {

        const map = new SharedMap(id, runtime);
        this.registerValueTypes(map);
        await map.load(minimumSequenceNumber, headerOrigin, services);

        return map;
    }

    public create(runtime: IComponentRuntime, id: string): ISharedMap {
        const map = new SharedMap(id, runtime);
        this.registerValueTypes(map);
        map.initializeLocal();

        return map;
    }

    private registerValueTypes(map: SharedMap) {
        for (const type of this.defaultValueTypes) {
            map.registerValueType(type);
        }
    }
}

/**
 * Implementation of a map shared object
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
        return runtime.createChannel(SharedObject.getIdForCreate(id), MapExtension.Type) as SharedMap;
    }

    /**
     * Get a factory for SharedMap to register with the component.
     *
     * @returns a factory that creates and load SharedMap
     */
    public static getFactory(defaultValueTypes: Array<IValueType<any>> = []): ISharedObjectExtension {
        return new MapExtension(defaultValueTypes);
    }

    public [Symbol.toStringTag]: string;
    private readonly data = new Map<string, ILocalViewElement>();
    private readonly valueTypes = new Map<string, IValueType<any>>();
    private readonly messageHandlers: Map<string, IMapMessageHandler>;
    private readonly pendingKeys: Map<string, number>;
    private pendingClearClientSequenceNumber: number;

    /**
     * Constructs a new shared map. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(
        id: string,
        runtime: IComponentRuntime,
        type = MapExtension.Type) {

        super(id, runtime, type);

        this.messageHandlers = new Map<string, IMapMessageHandler>();
        this.pendingKeys = new Map<string, number>();
        this.pendingClearClientSequenceNumber = -1;

        this.setMessageHandlers();
        this[Symbol.toStringTag] = "SharedMap";
    }

    public keys(): IterableIterator<string> {
        return this.data.keys();
    }

    // TODO: entries and values will have incorrect content until
    // map contains plain values and meta-data is segregated into
    // separate map
    public entries() {
        return this.data.entries();
    }

    public values() {
        return this.data.values();
    }

    public [Symbol.iterator]() {
        return this.data[Symbol.iterator]();
    }

    public get size() {
        return this.data.size;
    }

    // TODO: fix to pass-through when meta-data moved to separate map
    public forEach(callbackFn: (value: any, key: string, map: Map<string, any>) => void) {
        this.data.forEach((value, key, m) => {
            callbackFn(value.localValue, key, m);
        });
    }

    /**
     * Retrieves the value with the given key from the map.
     */
    public get(key: string) {
        if (!this.data.has(key)) {
            return undefined;
        }

        // Let's stash the *type* of the object on the key
        const value = this.data.get(key);

        return value.localValue;
    }

    public async wait<T>(key: string): Promise<T> {
        // Return immediately if the value already exists
        if (this.has(key)) {
            /* tslint:disable:no-unsafe-any */
            /* tslint:disable:no-object-literal-type-assertion */
            return this.get(key);
        }

        // Otherwise subscribe to changes
        return new Promise<T>((resolve, reject) => {
            const callback = (value: { key: string }) => {
                if (key === value.key) {
                    resolve(this.get(value.key));
                    this.removeListener("valueChanged", callback);
                }
            };

            this.on("valueChanged", callback);
        });
    }

    public has(key: string): boolean {
        return this.data.has(key);
    }

    public set<T = any>(key: string, value: T, type?: string): this {
        const values = this.prepareOperationValue(key, value, type);
        const op: IMapOperation = {
            key,
            type: "set",
            value: values.operationValue,
        };

        this.setCore(
            op.key,
            {
                localType: values.operationValue.type,
                localValue: values.localValue,
            },
            true,
            null);
        this.submitMapKeyMessage(op);
        return this;
    }

    public delete(key: string): boolean {
        const op: IMapOperation = {
            key,
            type: "delete",
        };

        const successfullyRemoved = this.deleteCore(op.key, true, null);
        this.submitMapKeyMessage(op);
        return successfullyRemoved;
    }

    public clear(): void {
        const op: IMapOperation = {
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

    public submitMapMessage(op: IMapOperation): number {
        return this.submitLocalMessage(op);
    }

    /**
     * Registers a new value type on the map
     */
    public registerValueType<T>(type: IValueType<T>) {
        this.valueTypes.set(type.name, type);

        function getOpHandler(op: IMapOperation): IValueOperation<T> {
            const handler = type.ops.get(op.value.type);
            if (!handler) {
                throw new Error("Unknown type message");
            }

            return handler;
        }

        // This wraps the IValueOperations (from within the passed IValueType) into an IMapMessageHandler.
        // Doing so allows the map to handle unfamiliar messages from the registered value types --
        // first by retrieving the specified item and then by applying the provided handlers.
        const valueTypeMessageHandler: IMapMessageHandler = {
            prepare: async (op, local, message) => {
                const handler = getOpHandler(op);
                const value = this.get(op.key);
                return handler.prepare(value, op.value.value, local, message);
            },

            process: (op, context, local, message) => {
                const handler = getOpHandler(op);
                const previousValue = this.get(op.key);
                handler.process(previousValue, op.value.value, context, local, message);
                const event: IValueChanged = { key: op.key, previousValue };
                this.emit("valueChanged", event, local, message);
            },

            submit: (op) => {
                this.submitLocalMessage(op);
            },
        };

        this.messageHandlers.set(type.name, valueTypeMessageHandler);
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
        const serialized: any = {};
        this.data.forEach((value, key) => {
            serialized[key] = this.spill(value);
        });
        return JSON.stringify(serialized);
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
            if (this.isMapMessage(message)) {
                mapMessages.push(message);
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
        minimumSequenceNumber: number,
        headerOrigin: string,
        storage: IObjectStorageService) {

        const header = await storage.read(snapshotFileName);

        const data = header ? JSON.parse(Buffer.from(header, "base64")
            .toString("utf-8")) : {};
        await this.populate(data);

        const contentStorage = new ContentObjectStorage(storage);
        await this.loadContent(
            minimumSequenceNumber,
            headerOrigin,
            contentStorage);
    }

    protected async loadContent(
        minimumSequenceNumber: number,
        headerOrigin: string,
        services: IObjectStorageService): Promise<void> {
        return;
    }

    protected prepareCore(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        if (message.type === MessageType.Operation) {
            const op: IMapOperation = message.contents;
            if (this.messageHandlers.has(op.type)) {
                return this.messageHandlers.get(op.type)
                    .prepare(op, local, message);
            }
        }

        return this.prepareContent(message, local);
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean, context: any) {
        let handled = false;
        if (message.type === MessageType.Operation) {
            const op: IMapOperation = message.contents;
            if (this.messageHandlers.has(op.type)) {
                this.messageHandlers.get(op.type)
                    .process(op, context, local, message);
                handled = true;
            }
        }

        if (!handled) {
            this.processContent(message, local, context);
        }
    }

    protected registerCore() {
        this.attachAll();

        this.attachContent();
    }

    // The following three methods enable derived classes to provide custom content that is stored
    // with the map

    protected attachContent() {
        return;
    }

    protected async prepareContent(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        return Promise.resolve();
    }

    /**
     * Processes a content message
     */
    protected processContent(message: ISequencedDocumentMessage, local: boolean, context: any) {
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

    private async populate(data: { [key: string]: IMapValue }): Promise<void> {
        const localValuesP = new Array<Promise<{ key: string, value: ILocalViewElement }>>();

        // tslint:disable-next-line:forin
        for (const key in data) {
            const value = data[key];
            const localValueP = this.fill(key, value)
                .then((filledValue) => ({ key, value: filledValue }));
            localValuesP.push(localValueP);
        }

        const localValues = await Promise.all(localValuesP);
        for (const localValue of localValues) {
            this.data.set(localValue.key, localValue.value);
        }
    }

    private attachAll() {
        for (const [, value] of this.data) {
            if (SharedObject.is(value.localValue)) {
                value.localValue.register();
            }
        }
    }

    private setCore(key: string, value: ILocalViewElement, local: boolean, op: ISequencedDocumentMessage) {
        const previousValue = this.get(key);
        this.data.set(key, value);
        const event: IValueChanged = { key, previousValue };
        this.emit("valueChanged", event, local, op);
    }

    private prepareSetCore(key: string, value: IMapValue): Promise<ILocalViewElement> {
        return this.fill(key, value);
    }

    private clearCore(local: boolean, op: ISequencedDocumentMessage) {
        this.data.clear();
        this.emit("clear", local, op);
    }

    private deleteCore(key: string, local: boolean, op: ISequencedDocumentMessage) {
        const previousValue = this.get(key);
        const successfullyRemoved = this.data.delete(key);
        if (successfullyRemoved) {
            const event: IValueChanged = { key, previousValue };
            this.emit("valueChanged", event, local, op);
        }
        return successfullyRemoved;
    }

    private clearExceptPendingKeys(pendingKeys: Map<string, number>) {
        // Assuming the pendingKeys is small and the map is large
        // we will get the value for the pendingKeys and clear the map
        const temp = new Map<string, ILocalViewElement>();
        pendingKeys.forEach((value, key, map) => {
            temp.set(key, this.data.get(key));
        });
        this.data.clear();
        temp.forEach((value, key, map) => {
            this.data.set(key, value);
        });
    }

    private isMapMessage(message: any): boolean {
        const type = message.type;
        return this.messageHandlers.has(type);
    }

    private async fill(key: string, remote: IMapValue): Promise<ILocalViewElement> {
        let translatedValue: any;
        if (remote.type === ValueType[ValueType.Shared]) {
            const distributedObject = await this.runtime.getChannel(remote.value);
            translatedValue = distributedObject;
        } else if (remote.type === ValueType[ValueType.Plain]) {
            translatedValue = remote.value;
        } else if (this.hasValueType(remote.type)) {
            const valueType = this.getValueType(remote.type);
            translatedValue = valueType.factory.load(new MapValueOpEmitter(remote.type, key, this), remote.value);
        } else {
            return Promise.reject(`Unknown value type "${remote.type}"`);
        }

        return {
            localType: remote.type,
            localValue: translatedValue,
        };
    }

    private spill(local: ILocalViewElement): IMapValue {
        if (local.localType === ValueType[ValueType.Shared]) {
            const distributedObject = local.localValue as ISharedObject;

            // If the map is already registered then register the sharedObject
            // This feels slightly out of place here since it has a side effect. But is part of spilling a document.
            // Not sure if there is some kind of prep call to separate the op creation from things needed to make it
            // (like attaching)
            if (this.isRegistered()) {
                distributedObject.register();
            }
            return {
                type: ValueType[ValueType.Shared],
                value: distributedObject.id,
            };
        } else if (this.hasValueType(local.localType)) {
            const valueType = this.getValueType(local.localType);
            return {
                type: local.localType,
                value: valueType.factory.store(local.localValue),
            };
        } else {
            return {
                type: ValueType[ValueType.Plain],
                value: local.localValue,
            };
        }
    }

    private needProcessKeyOperations(op: IMapOperation, local: boolean, message: ISequencedDocumentMessage): boolean {
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
        const defaultPrepare = (op: IMapOperation, local: boolean) => Promise.resolve();
        // tslint:disable:no-backbone-get-set-outside-model
        this.messageHandlers.set(
            "clear",
            {
                prepare: defaultPrepare,
                process: (op, context, local, message) => {
                    if (local) {
                        if (this.pendingClearClientSequenceNumber === message.clientSequenceNumber) {
                            this.pendingClearClientSequenceNumber = -1;
                        }
                        return false;
                    }
                    if (this.pendingKeys.size !== 0) {
                        this.clearExceptPendingKeys(this.pendingKeys);
                        return;
                    }
                    this.clearCore(local, message);
                },
                submit: (op) => {
                    this.submitMapClearMessage(op);
                },
            });
        this.messageHandlers.set(
            "delete",
            {
                prepare: defaultPrepare,
                process: (op, context, local, message) => {
                    if (!this.needProcessKeyOperations(op, local, message)) {
                        return;
                    }
                    return this.deleteCore(op.key, local, message);
                },
                submit: (op) => {
                    this.submitMapKeyMessage(op);
                },
            });
        this.messageHandlers.set(
            "set",
            {
                prepare: (op, local) => {
                    return local ? Promise.resolve(null) : this.prepareSetCore(op.key, op.value);
                },
                process: (op, context, local, message) => {
                    if (!this.needProcessKeyOperations(op, local, message)) {
                        return;
                    }
                    this.setCore(op.key, context, local, message);
                },
                submit: (op) => {
                    this.submitMapKeyMessage(op);
                },
            });
    }

    private prepareOperationValue<T = any>(key: string, value: T, type?: string) {
        let operationValue: IMapValue;
        if (type) {
            const valueType = this.getValueType(type);
            if (!valueType) {
                throw new Error(`Unknown type '${type}' specified`);
            }

            // set operationValue first with the raw value params prior to doing the load
            operationValue = {
                type,
                value,
            };
            // tslint:disable-next-line:no-parameter-reassignment
            value = valueType.factory.load(new MapValueOpEmitter(type, key, this), value);
        } else {
            const valueType = SharedObject.is(value)
                ? ValueType[ValueType.Shared]
                : ValueType[ValueType.Plain];
            operationValue = this.spill({ localType: valueType, localValue: value });
        }
        return { operationValue, localValue : value };
    }

    private submitMapClearMessage(op: IMapOperation): void {
        const clientSequenceNumber = this.submitMapMessage(op);
        if (clientSequenceNumber !== -1) {
            this.pendingClearClientSequenceNumber = clientSequenceNumber;
        }
    }

    private submitMapKeyMessage(op: IMapOperation): void {
        const clientSequenceNumber = this.submitMapMessage(op);
        if (clientSequenceNumber !== -1) {
            this.pendingKeys.set(op.key, clientSequenceNumber);
        }
    }

    private hasValueType(type: string): boolean {
        return this.valueTypes.has(type);
    }

    private getValueType(type: string) {
        return this.valueTypes.get(type);
    }
}

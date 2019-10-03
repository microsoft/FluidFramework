/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromBase64ToUtf8 } from "@microsoft/fluid-core-utils";
import { FileMode, ISequencedDocumentMessage, ITree, MessageType, TreeEntry } from "@microsoft/fluid-protocol-definitions";
import {
    IChannelAttributes,
    IComponentRuntime,
    IObjectStorageService,
    ISharedObjectServices,
} from "@microsoft/fluid-runtime-definitions";
import {
    ISharedObjectFactory,
    SharedObject,
} from "@microsoft/fluid-shared-object-base";
import { debug } from "./debug";
import {
    ISharedMap,
    IValueChanged,
} from "./interfaces";
import {
    valueTypes,
} from "./localValues";
import { MapKernel } from "./mapKernel";
import { pkgVersion } from "./packageVersion";

const snapshotFileName = "header";

/**
 * The factory that defines the map.
 * @sealed
 */
export class MapFactory implements ISharedObjectFactory {
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory."type"}
     */
    public static readonly Type = "https://graph.microsoft.com/types/map";

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.attributes}
     */
    public static readonly Attributes: IChannelAttributes = {
        type: MapFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory."type"}
     */
    public get type() {
        return MapFactory.Type;
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.attributes}
     */
    public get attributes() {
        return MapFactory.Attributes;
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.load}
     */
    public async load(
        runtime: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string): Promise<ISharedMap> {

        const map = new SharedMap(id, runtime);
        await map.load(branchId, services);

        return map;
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.create}
     */
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
     * Create a new shared map.
     * @param runtime - Component runtime the new shared map belongs to
     * @param id - Optional name of the shared map
     * @returns Newly create shared map (but not attached yet)
     */
    public static create(runtime: IComponentRuntime, id?: string): SharedMap {
        return runtime.createChannel(SharedObject.getIdForCreate(id), MapFactory.Type) as SharedMap;
    }

    /**
     * Get a factory for SharedMap to register with the component.
     * @returns A factory that creates and load SharedMap
     */
    public static getFactory(): ISharedObjectFactory {
        return new MapFactory();
    }

    /**
     * String representation for the class.
     */
    public readonly [Symbol.toStringTag]: string = "SharedMap";

    /**
     * MapKernel which manages actual map operations.
     */
    private readonly kernel: MapKernel;

    /**
     * Create a new SharedMap.
     * @param id - String identifier
     * @param runtime - Component runtime
     * @param attributes - The attributes for the map
     */
    constructor(
        id: string,
        runtime: IComponentRuntime,
        attributes = MapFactory.Attributes,
    ) {
        super(id, runtime, attributes);
        this.kernel = new MapKernel(
            runtime,
            this.handle,
            (op) => this.submitLocalMessage(op),
            valueTypes,
            this,
        );
    }

    /**
     * {@inheritDoc MapKernel.keys}
     */
    public keys(): IterableIterator<string> {
        return this.kernel.keys();
    }

    /**
     * {@inheritDoc MapKernel.entries}
     */
    public entries(): IterableIterator<[string, any]> {
        return this.kernel.entries();
    }

    /**
     * {@inheritDoc MapKernel.values}
     */
    public values(): IterableIterator<any> {
        return this.kernel.values();
    }

    /**
     * Get an iterator over the entries in this map.
     * @returns The iterator
     */
    public [Symbol.iterator](): IterableIterator<[string, any]> {
        return this.kernel.entries();
    }

    /**
     * {@inheritDoc MapKernel.size}
     */
    public get size() {
        return this.kernel.size;
    }

    /**
     * {@inheritDoc MapKernel.forEach}
     */
    public forEach(callbackFn: (value: any, key: string, map: Map<string, any>) => void): void {
        this.kernel.forEach(callbackFn);
    }

    /**
     * {@inheritDoc ISharedMap.get}
     */
    public get<T = any>(key: string): T {
        return this.kernel.get<T>(key);
    }

    /**
     * {@inheritDoc ISharedMap.wait}
     */
    public async wait<T = any>(key: string): Promise<T> {
        return this.kernel.wait<T>(key);
    }

    /**
     * {@inheritDoc MapKernel.has}
     */
    public has(key: string): boolean {
        return this.kernel.has(key);
    }

    /**
     * {@inheritDoc ISharedMap.set}
     */
    public set(key: string, value: any): this {
        this.kernel.set(key, value);
        return this;
    }

    /**
     * {@inheritDoc IValueTypeCreator.createValueType}
     */
    public createValueType(key: string, type: string, params: any): this {
        this.kernel.createValueType(key, type, params);
        return this;
    }

    /**
     * {@inheritDoc MapKernel.delete}
     */
    public delete(key: string): boolean {
        return this.kernel.delete(key);
    }

    /**
     * {@inheritDoc MapKernel.clear}
     */
    public clear(): void {
        this.kernel.clear();
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.snapshot}
     */
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
     * Serializes the data stored in the shared map to a JSON string
     * @returns A JSON string
     */
    public serialize(): string {
        return this.kernel.serialize();
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.onDisconnect}
     */
    protected onDisconnect() {
        debug(`Map ${this.id} is now disconnected`);
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.onConnect}
     */
    protected onConnect(pending: any[]) {
        debug(`Map ${this.id} is now connected`);

        for (const message of pending) {
            this.kernel.trySubmitMessage(message);
        }
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.loadCore}
     */
    protected async loadCore(
        branchId: string,
        storage: IObjectStorageService) {

        const header = await storage.read(snapshotFileName);

        const data: string = header ? fromBase64ToUtf8(header) : undefined;
        this.kernel.populate(data);
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.processCore}
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean) {
        if (message.type === MessageType.Operation) {
            this.kernel.tryProcessMessage(message, local);
        }
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.registerCore}
     */
    protected registerCore() {
        for (const value of this.values()) {
            if (SharedObject.is(value)) {
                value.register();
            }
        }
    }
}

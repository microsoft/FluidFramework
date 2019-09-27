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
const contentPath = "content";

export class ContentObjectStorage implements IObjectStorageService {
    constructor(private readonly storage: IObjectStorageService) {
    }

    /* tslint:disable:promise-function-async */
    public read(path: string): Promise<string> {
        return this.storage.read(`${contentPath}/${path}`);
    }
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
    private readonly kernel: MapKernel;

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
        this.kernel = new MapKernel(
            runtime,
            this.handle,
            (op) => this.submitLocalMessage(op),
            valueTypes,
            this,
        );
    }

    public keys(): IterableIterator<string> {
        return this.kernel.keys();
    }

    public entries(): IterableIterator<[string, any]> {
        return this.kernel.entries();
    }

    public values(): IterableIterator<any> {
        return this.kernel.values();
    }

    public [Symbol.iterator](): IterableIterator<[string, any]> {
        return this.kernel.entries();
    }

    public get size() {
        return this.kernel.size;
    }

    // TODO: fix to pass-through when meta-data moved to separate map
    public forEach(callbackFn: (value: any, key: string, map: Map<string, any>) => void) {
        this.kernel.forEach((value, key, m) => {
            callbackFn(value, key, m);
        });
    }

    /**
     * Retrieves the value with the given key from the map.
     */
    public get<T = any>(key: string): T {
        return this.kernel.get<T>(key);
    }

    public async wait<T = any>(key: string): Promise<T> {
        return this.kernel.wait<T>(key);
    }

    public has(key: string): boolean {
        return this.kernel.has(key);
    }

    /**
     * Public set API.
     * @param key - key to set
     * @param value - value to set
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
     * Public delete API.
     * @param key - key to delete
     */
    public delete(key: string): boolean {
        return this.kernel.delete(key);
    }

    /**
     * Public clear API.
     */
    public clear(): void {
        this.kernel.clear();
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

    public serialize() {
        return this.kernel.serialize();
    }

    protected onDisconnect() {
        debug(`Map ${this.id} is now disconnected`);
    }

    protected onConnect(pending: any[]) {
        debug(`Map ${this.id} is now connected`);
        // REVIEW: Does it matter that the map and content message get out of order?

        // Filter the nonAck and pending messages into a map set and a content set.
        const mapMessages = [];
        const contentMessages: any[] = [];
        for (const message of pending) {
            if (this.kernel.hasHandlerFor(message)) {
                mapMessages.push(message);
            } else {
                contentMessages.push(message);
            }
        }

        // Deal with the map messages - for the map it's always last one wins so we just resend
        for (const message of mapMessages) {
            this.kernel.trySubmitMessage(message);
        }

    }

    protected async loadCore(
        branchId: string,
        storage: IObjectStorageService) {

        const header = await storage.read(snapshotFileName);

        const data: string = header ? fromBase64ToUtf8(header) : undefined;
        this.kernel.populate(data);
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean) {
        if (message.type === MessageType.Operation) {
            this.kernel.tryProcessMessage(message, local);
        }
    }

    protected registerCore() {
        for (const value of this.values()) {
            if (SharedObject.is(value)) {
                value.register();
            }
        }
    }
}

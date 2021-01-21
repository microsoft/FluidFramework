/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromBase64ToUtf8 } from "@fluidframework/common-utils";
import { IFluidSerializer } from "@fluidframework/core-interfaces";
import { addBlobToTree } from "@fluidframework/protocol-base";
import {
    ISequencedDocumentMessage,
    ITree,
    MessageType,
} from "@fluidframework/protocol-definitions";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelStorageService,
    IChannelServices,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import {
    SharedObject,
} from "@fluidframework/shared-object-base";
import { debug } from "./debug";
import {
    ISharedMap,
    ISharedMapEvents,
} from "./interfaces";
import { IMapDataObjectSerializable, MapKernel } from "./mapKernel";
import { pkgVersion } from "./packageVersion";

interface IMapSerializationFormat {
    blobs?: string[];
    content: IMapDataObjectSerializable;
}

const snapshotFileName = "header";

/**
 * The factory that defines the map.
 * @sealed
 */
export class MapFactory implements IChannelFactory {
    /**
    * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
    */
    public static readonly Type = "https://graph.microsoft.com/types/map";

    /**
    * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
    */
    public static readonly Attributes: IChannelAttributes = {
        type: MapFactory.Type,
        snapshotFormatVersion: "0.2",
        packageVersion: pkgVersion,
    };

    /**
    * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
    */
    public get type() {
        return MapFactory.Type;
    }

    /**
    * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
    */
    public get attributes() {
        return MapFactory.Attributes;
    }

    /**
    * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
    */
    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes): Promise<ISharedMap> {
        const map = new SharedMap(id, runtime, attributes);
        await map.load(services);

        return map;
    }

    /**
    * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
    */
    public create(runtime: IFluidDataStoreRuntime, id: string): ISharedMap {
        const map = new SharedMap(id, runtime, MapFactory.Attributes);
        map.initializeLocal();

        return map;
    }
}

/**
 * The SharedMap distributed data structure can be used to store key-value pairs. It provides the same API for setting
 * and retrieving values that JavaScript developers are accustomed to with the
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map | Map} built-in object.
 * However, the keys of a SharedMap must be strings.
 */
export class SharedMap extends SharedObject<ISharedMapEvents> implements ISharedMap {
    /**
     * Create a new shared map.
     * @param runtime - The data store runtime that the new shared map belongs to.
     * @param id - Optional name of the shared map.
     * @returns Newly created shared map.
     *
     * @example
     * To create a `SharedMap`, call the static create method:
     *
     * ```typescript
     * const myMap = SharedMap.create(this.runtime, id);
     * ```
     *
     */
    public static create(runtime: IFluidDataStoreRuntime, id?: string): SharedMap {
        return runtime.createChannel(id, MapFactory.Type) as SharedMap;
    }

    /**
     * Get a factory for SharedMap to register with the data store.
     * @returns A factory that creates SharedMaps and loads them from storage.
     */
    public static getFactory(): IChannelFactory {
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
    * Do not call the constructor. Instead, you should use the {@link SharedMap.create | create method}.
    *
    * @param id - String identifier.
    * @param runtime - Data store runtime.
    * @param attributes - The attributes for the map.
    */
    constructor(
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes,
    ) {
        super(id, runtime, attributes);
        this.kernel = new MapKernel(
            this.serializer,
            this.handle,
            (op, localOpMetadata) => this.submitLocalMessage(op, localOpMetadata),
            () => this.isAttached(),
            [],
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
    public get<T = any>(key: string): T | undefined {
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
    * {@inheritDoc @fluidframework/shared-object-base#SharedObject.snapshotCore}
    */
   protected snapshotCore(serializer: IFluidSerializer): ITree {
        let currentSize = 0;
        let counter = 0;
        let headerBlob: IMapDataObjectSerializable = {};
        const blobs: string[] = [];

        const tree: ITree = {
            entries: [],
        };

        const data = this.kernel.getSerializedStorage(serializer);

        // If single property exceeds this size, it goes into its own blob
        const MinValueSizeSeparateSnapshotBlob = 8 * 1024;

        // Maximum blob size for multiple map properties
        // Should be bigger than MinValueSizeSeparateSnapshotBlob
        const MaxSnapshotBlobSize = 16 * 1024;

        // Partitioning algorithm:
        // 1) Split large (over MinValueSizeSeparateSnapshotBlob = 8K) properties into their own blobs.
        //    Naming (across snapshots) of such blob does not have to be stable across snapshots,
        //    As de-duping process (in driver) should not care about paths, only content.
        // 2) Split remaining properties into blobs of MaxSnapshotBlobSize (16K) size.
        //    This process does not produce stable partitioning. This means
        //    modification (including addition / deletion) of property can shift properties across blobs
        //    and result in non-incremental snapshot.
        //    This can be improved in the future, without being format breaking change, as loading sequence
        //    loads all blobs at once and partitioning schema has no impact on that process.
        for (const key of Object.keys(data)) {
            const value = data[key];
            if (value.value && value.value.length >= MinValueSizeSeparateSnapshotBlob) {
                const blobName = `blob${counter}`;
                counter++;
                blobs.push(blobName);
                const content: IMapDataObjectSerializable = {
                    [key]: {
                        type: value.type,
                        value: JSON.parse(value.value),
                    },
                };
                addBlobToTree(tree, blobName, content);
            } else {
                currentSize += value.type.length + 21; // Approximation cost of property header
                if (value.value) {
                    currentSize += value.value.length;
                }

                if (currentSize > MaxSnapshotBlobSize) {
                    const blobName = `blob${counter}`;
                    counter++;
                    blobs.push(blobName);
                    addBlobToTree(tree, blobName, headerBlob);
                    headerBlob = {};
                    currentSize = 0;
                }
                headerBlob[key] = {
                    type: value.type,
                    value: value.value === undefined ? undefined : JSON.parse(value.value),
                };
            }
        }

        const header: IMapSerializationFormat = {
            blobs,
            content: headerBlob,
        };
        addBlobToTree(tree, snapshotFileName, header);

        return tree;
    }

    public getSerializableStorage(): IMapDataObjectSerializable {
        return this.kernel.getSerializableStorage(this.serializer);
    }

    /**
    * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
    */
    protected async loadCore(storage: IChannelStorageService) {
        const header = await storage.read(snapshotFileName);

        const data = fromBase64ToUtf8(header);
        // eslint-disable-next-line @typescript-eslint/ban-types
        const json = JSON.parse(data) as object;
        const newFormat = json as IMapSerializationFormat;
        if (Array.isArray(newFormat.blobs)) {
            this.kernel.populateFromSerializable(newFormat.content);
            await Promise.all(newFormat.blobs.map(async (value) => {
                const blob = await storage.read(value);
                const blobData = fromBase64ToUtf8(blob);
                this.kernel.populateFromSerializable(JSON.parse(blobData) as IMapDataObjectSerializable);
            }));
        } else {
            this.kernel.populateFromSerializable(json as IMapDataObjectSerializable);
        }
    }

    /**
    * {@inheritDoc @fluidframework/shared-object-base#SharedObject.onDisconnect}
    */
    protected onDisconnect() {
        debug(`Map ${this.id} is now disconnected`);
    }

    /**
      * {@inheritDoc @fluidframework/shared-object-base#SharedObject.reSubmitCore}
      */
    protected reSubmitCore(content: any, localOpMetadata: unknown) {
        this.kernel.trySubmitMessage(content, localOpMetadata);
    }

    /**
    * {@inheritDoc @fluidframework/shared-object-base#SharedObject.processCore}
    */
    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        if (message.type === MessageType.Operation) {
            this.kernel.tryProcessMessage(message, local, localOpMetadata);
        }
    }

    /**
    * {@inheritDoc @fluidframework/shared-object-base#SharedObject.registerCore}
    */
    protected registerCore() {
        for (const value of this.values()) {
            if (SharedObject.is(value)) {
                value.bindToContext();
            }
        }
    }
}

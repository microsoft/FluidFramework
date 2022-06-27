/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelStorageService,
    IChannelServices,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { ISummaryTreeWithStats, ITelemetryContext } from "@fluidframework/runtime-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import {
    IFluidSerializer,
    SharedObject,
} from "@fluidframework/shared-object-base";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils";
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
        super(id, runtime, attributes, "fluid_map_");
        this.kernel = new MapKernel(
            this.serializer,
            this.handle,
            (op, localOpMetadata) => this.submitLocalMessage(op, localOpMetadata),
            () => this.isAttached(),
            this,
        );
    }

    /**
     * Get an iterator over the keys in this map.
     * @returns The iterator
     */
    public keys(): IterableIterator<string> {
        return this.kernel.keys();
    }

    /**
     * Get an iterator over the entries in this map.
     * @returns The iterator
     */
    public entries(): IterableIterator<[string, any]> {
        return this.kernel.entries();
    }

    /**
     * Get an iterator over the values in this map.
     * @returns The iterator
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
     * The number of key/value pairs stored in the map.
     */
    public get size() {
        return this.kernel.size;
    }

    /**
     * Executes the given callback on each entry in the map.
     * @param callbackFn - Callback function
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
     * Check if a key exists in the map.
     * @param key - The key to check
     * @returns True if the key exists, false otherwise
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
     * Delete a key from the map.
     * @param key - Key to delete
     * @returns True if the key existed and was deleted, false if it did not exist
     */
    public delete(key: string): boolean {
        return this.kernel.delete(key);
    }

    /**
     * Clear all data from the map.
     */
    public clear(): void {
        this.kernel.clear();
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.summarizeCore}
     * @internal
     */
    protected summarizeCore(
        serializer: IFluidSerializer,
        telemetryContext?: ITelemetryContext,
    ): ISummaryTreeWithStats {
        let currentSize = 0;
        let counter = 0;
        let headerBlob: IMapDataObjectSerializable = {};
        const blobs: string[] = [];

        const builder = new SummaryTreeBuilder();

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
                builder.addBlob(blobName, JSON.stringify(content));
            } else {
                currentSize += value.type.length + 21; // Approximation cost of property header
                if (value.value) {
                    currentSize += value.value.length;
                }

                if (currentSize > MaxSnapshotBlobSize) {
                    const blobName = `blob${counter}`;
                    counter++;
                    blobs.push(blobName);
                    builder.addBlob(blobName, JSON.stringify(headerBlob));
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
        builder.addBlob(snapshotFileName, JSON.stringify(header));

        return builder.getSummaryTree();
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
     * @internal
     */
    protected async loadCore(storage: IChannelStorageService) {
        const json = await readAndParse<object>(storage, snapshotFileName);
        const newFormat = json as IMapSerializationFormat;
        if (Array.isArray(newFormat.blobs)) {
            this.kernel.populateFromSerializable(newFormat.content);
            await Promise.all(newFormat.blobs.map(async (value) => {
                const content = await readAndParse<IMapDataObjectSerializable>(storage, value);
                this.kernel.populateFromSerializable(content);
            }));
        } else {
            this.kernel.populateFromSerializable(json as IMapDataObjectSerializable);
        }
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.onDisconnect}
     * @internal
     */
    protected onDisconnect() {}

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.reSubmitCore}
     * @internal
     */
    protected reSubmitCore(content: any, localOpMetadata: unknown) {
        this.kernel.trySubmitMessage(content, localOpMetadata);
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObjectCore.applyStashedOp}
     * @internal
     */
    protected applyStashedOp(content: any): unknown {
        this.kernel.tryProcessMessage(content, false, undefined);
        return this.kernel.tryGetStashedOpLocalMetadata(content);
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.processCore}
     * @internal
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        if (message.type === MessageType.Operation) {
            this.kernel.tryProcessMessage(message.contents, local, localOpMetadata);
        }
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.rollback}
     * @internal
    */
   protected rollback(content: any, localOpMetadata: unknown) {
       this.kernel.rollback(content, localOpMetadata);
   }
}

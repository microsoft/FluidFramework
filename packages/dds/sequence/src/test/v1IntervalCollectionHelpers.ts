/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidDataStoreRuntime,
    IChannelFactory,
    IChannelServices,
    IChannelAttributes,
} from "@fluidframework/datastore-definitions";
import { Client } from "@fluidframework/merge-tree";
import { DefaultMap } from "../defaultMap";
import { IValueFactory, IValueOpEmitter, IValueType, IValueOperation } from "../defaultMapInterfaces";
import {
    ISerializableInterval,
    ISerializedInterval,
    IntervalCollection, SequenceInterval,
    ISerializedIntervalCollectionV2,
    IIntervalHelpers,
    makeOpsMap,
    createSequenceInterval,
    compareSequenceIntervalEnds,
    LocalIntervalCollection,
} from "../intervalCollection";
import { pkgVersion } from "../packageVersion";
import { SharedString } from "../sharedString";

export interface IntervalCollectionInternals<TInterval extends ISerializableInterval> {
    client: Client;
    savedSerializedIntervals?: ISerializedInterval[];
    localCollection: LocalIntervalCollection<SequenceInterval>;
    getNextLocalSeq(): number;
}

export class V1IntervalCollection<TInterval extends ISerializableInterval>
 extends IntervalCollection<SequenceInterval> {
    casted = (this as unknown as IntervalCollectionInternals<SequenceInterval>);
}

class V1SequenceIntervalCollectionFactory
    implements IValueFactory<V1IntervalCollection<SequenceInterval>> {
    public load(
        emitter: IValueOpEmitter,
        raw: ISerializedInterval[] | ISerializedIntervalCollectionV2 = [],
    ): V1IntervalCollection<SequenceInterval> {
        const helpers: IIntervalHelpers<SequenceInterval> = {
            compareEnds: compareSequenceIntervalEnds,
            create: createSequenceInterval,
        };
        return new V1IntervalCollection(helpers, true, emitter, raw);
    }
    public store(value: V1IntervalCollection<SequenceInterval>):
    ISerializedInterval[] | ISerializedIntervalCollectionV2 {
        return Array.from(value, (interval) => interval?.serialize()) as unknown as
        ISerializedIntervalCollectionV2;
    }
}

export class V1SequenceIntervalCollectionValueType
    implements IValueType<V1IntervalCollection<SequenceInterval>> {
    public static Name = "sharedStringIntervalCollection";

    public get name(): string {
        return V1SequenceIntervalCollectionValueType.Name;
    }

    public get factory(): IValueFactory<V1IntervalCollection<SequenceInterval>> {
        return V1SequenceIntervalCollectionValueType._factory;
    }

    public get ops(): Map<string, IValueOperation<V1IntervalCollection<SequenceInterval>>> {
        return V1SequenceIntervalCollectionValueType._ops;
    }

    private static readonly _factory: IValueFactory<V1IntervalCollection<SequenceInterval>> =
        new V1SequenceIntervalCollectionFactory();

    private static readonly _ops = makeOpsMap<SequenceInterval>();
}

interface SharedStringInternals {
    intervalCollections: DefaultMap<V1IntervalCollection<SequenceInterval>>;
}

export class SharedStringWithV1IntervalCollection
    extends SharedString {
    /**
     * Create a new shared string.
     * @param runtime - data store runtime the new shared string belongs to
     * @param id - optional name of the shared string
     * @returns newly create shared string (but not attached yet)
     */
     public static create(runtime: IFluidDataStoreRuntime, id?: string) {
        return runtime.createChannel(id,
            V1IntervalCollectionSharedStringFactory.Type) as SharedStringWithV1IntervalCollection;
    }

    /**
     * Get a factory for SharedString to register with the data store.
     * @returns a factory that creates and load SharedString
     */
    public static getFactory() {
        return new V1IntervalCollectionSharedStringFactory();
    }

    constructor(document: IFluidDataStoreRuntime, public id: string, attributes: IChannelAttributes) {
        super(document, id, attributes);
        (this as unknown as SharedStringInternals).intervalCollections = new DefaultMap(
            this.serializer,
            this.handle,
            (op, localOpMetadata) => this.submitLocalMessage(op, localOpMetadata),
            new V1SequenceIntervalCollectionValueType(),
        );
    }
}

export class V1IntervalCollectionSharedStringFactory implements IChannelFactory {
    // TODO rename back to https://graph.microsoft.com/types/mergeTree/string once paparazzi is able to dynamically
    // load code
    public static Type = "https://graph.microsoft.com/types/mergeTree";

    public static readonly Attributes: IChannelAttributes = {
        type: V1IntervalCollectionSharedStringFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public get type() {
        return V1IntervalCollectionSharedStringFactory.Type;
    }

    public get attributes() {
        return V1IntervalCollectionSharedStringFactory.Attributes;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
     */
    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes): Promise<SharedStringWithV1IntervalCollection> {
        const sharedString = new SharedStringWithV1IntervalCollection(runtime, id, attributes);
        await sharedString.load(services);
        return sharedString;
    }

    public create(document: IFluidDataStoreRuntime, id: string): SharedStringWithV1IntervalCollection {
        const sharedString = new SharedStringWithV1IntervalCollection(document, id, this.attributes);
        sharedString.initializeLocal();
        return sharedString;
    }
}

// import { compareReferencePositions } from "@fluidframework/merge-tree";
import {
    IFluidDataStoreRuntime,
    IChannelFactory,
    IChannelServices,
    IChannelAttributes,
} from "@fluidframework/datastore-definitions";
// import { TextSegment, Marker } from "@fluidframework/merge-tree";
import { LoggingError } from "@fluidframework/telemetry-utils";
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
} from "../intervalCollection";
import { pkgVersion } from "../packageVersion";
import { SharedString } from "../sharedString";

export interface IntervalCollectionInternals<TInterval extends ISerializableInterval> {
    savedSerializedIntervals?: ISerializedInterval[];
    // localCollection: LocalIntervalCollection<TInterval>;
    // client: Client | undefined;
    // readonly helpers: IIntervalHelpers<TInterval>;
    // readonly requiresClient: boolean;
    // /**
    //  * @internal
    //  */
    // readonly emitter: IValueOpEmitter;
    getNextLocalSeq(): number;
}

export class V1IntervalCollection<TInterval extends ISerializableInterval>
 extends IntervalCollection<SequenceInterval> {
    casted = (this as unknown as IntervalCollectionInternals<SequenceInterval>);

    // public get attached(): boolean {
    //     return !!this.casted.localCollection;
    // }

    /**
     * @internal
     */
    // actually returns an ISerializedInterval[], but it is cast as an ISerializableIntervalCollectionV2
     public override serializeInternal(): ISerializedIntervalCollectionV2 {
        if (!this.attached) {
            throw new LoggingError("attachSequence must be called");
        }
        const intervals = this.casted.savedSerializedIntervals;

        // Cast intervals as the new document format so the return type matches but we have the old format's type
        return (intervals as unknown as ISerializedIntervalCollectionV2);
    }

    /**
     * Create a new interval and add it to the collection
     * @param start - interval start position
     * @param end - interval end position
     * @param intervalType - type of the interval. All intervals are SlideOnRemove. Intervals may not be Transient.
     * @param props - properties of the interval
     * @returns - the created interval
     */
    //  public add(
    //     start: number,
    //     end: number,
    //     intervalType: IntervalType,
    //     props?: PropertySet,
    // ) {
    //     if (!this.attached) {
    //         throw new LoggingError("attach must be called prior to adding intervals");
    //     }
    //     if (intervalType & IntervalType.Transient) {
    //         throw new LoggingError("Can not add transient intervals");
    //     }

    //     // eslint-disable-next-line max-len
    //     const interval: SequenceInterval = this.casted.localCollection.addInterval(start, end, intervalType, props);

    //     if (interval) {
    //         const serializedInterval = {
    //             end,
    //             intervalType,
    //             properties: interval.properties,
    //             sequenceNumber:
    //             this.casted.client?.getCurrentSeq() ?? 0,
    //             start,
    //         };
    //         // Local ops get submitted to the server. Remote ops have the deserializer run.
    //         this.casted.emitter.emit(
    //             "add", undefined, serializedInterval, { localSeq: this.casted.getNextLocalSeq() },
    //         );
    //     }

    //     this.emit("addInterval", interval, true, undefined);

    //     return interval;
    // }

    // public attachGraph(client: Client, label: string) {
    //     if (this.attached) {
    //         throw new LoggingError("Only supports one Sequence attach");
    //     }

    //     if ((client === undefined) &&
    //         (this.casted.requiresClient)) {
    //         throw new LoggingError("Client required for this collection");
    //     }

    //     // Instantiate the local interval collection based on the saved intervals
    //     this.casted.client = client;
    //     // eslint-disable-next-line max-len
    //     this.casted.localCollection = new LocalIntervalCollection<SequenceInterval>(
    //         client,
    //         label,
    //         this.casted.helpers,
    //         (interval) => this.emit("changeInterval", interval, true, undefined),
    //     );
    //     if (this.casted.savedSerializedIntervals) {
    //         // eslint-disable-next-line max-len
    //         for (const serializedInterval of this.casted.savedSerializedIntervals) {
    //             // eslint-disable-next-line max-len
    //             this.casted.localCollection.ensureSerializedId(serializedInterval);
    //             const { start, end, intervalType, properties } = serializedInterval;
    //             const interval = this.casted.helpers.create(
    //                 label,
    //                 start,
    //                 end,
    //                 client,
    //                 intervalType,
    //                 undefined,
    //                 true,
    //             );
    //             interval.addProperties(properties);
    //             this.casted.localCollection.add(interval);
    //         }
    //     }
    //     this.casted.savedSerializedIntervals = undefined;
    // }

    // public [Symbol.iterator](): IntervalCollectionIterator<SequenceInterval> {
    //     const iterator = new IntervalCollectionIterator<SequenceInterval>(this);
    //     return iterator;
    // }

    // public gatherIterationResults(
    //     results: SequenceInterval[],
    //     iteratesForward: boolean,
    //     start?: number,
    //     end?: number) {
    //     if (!this.attached) {
    //         return;
    //     }

    //     this.casted.localCollection.gatherIterationResults(results, iteratesForward, start, end);
    // }

    // public findOverlappingIntervals(startPosition: number, endPosition: number): SequenceInterval[] {
    //     if (!this.attached) {
    //         throw new LoggingError("attachSequence must be called");
    //     }

    //     return this.casted.localCollection.findOverlappingIntervals(startPosition, endPosition);
    // }

    // /**
    //  * Gets the next local sequence number, modifying this client's collab window in doing so.
    //  */
    // private getNextLocalSeq(): number {
    //     if (this.casted.client) {
    //         return ++this.casted.client.getCollabWindow().localSeq;
    //     }

    //     return 0;
    // }
}

// const compareSequenceIntervalEnds = (a: SequenceInterval, b: SequenceInterval): number =>
//     compareReferencePositions(a.end, b.end);

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
        return value.serializeInternal();
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return V1SequenceIntervalCollectionValueType._ops;
    }

    private static readonly _factory: IValueFactory<V1IntervalCollection<SequenceInterval>> =
        new V1SequenceIntervalCollectionFactory();

    private static readonly _ops = makeOpsMap<SequenceInterval>();
}

interface SharedStringInternals {
    intervalCollections: DefaultMap<IntervalCollection<SequenceInterval>>;
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

    // public static segmentFromSpec(spec: any): SharedStringSegment {
    //     const maybeText = TextSegment.fromJSONObject(spec);
    //     if (maybeText) { return maybeText; }

    //     const maybeMarker = Marker.fromJSONObject(spec);
    //     if (maybeMarker) { return maybeMarker; }
    // }

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

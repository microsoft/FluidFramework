/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { assert, TypedEventEmitter } from "@fluidframework/common-utils";
import { IEvent } from "@fluidframework/common-definitions";
import { UsageError } from "@fluidframework/container-utils";
import {
    addProperties,
    Client,
    ConflictAction,
    createMap,
    ICombiningOp,
    IInterval,
    IntervalConflictResolver,
    IntervalNode,
    IntervalTree,
    ISegment,
    LocalReference,
    MergeTreeDeltaType,
    PropertiesManager,
    PropertySet,
    RedBlackTree,
    ReferenceType,
    refTypeIncludesFlag,
    reservedRangeLabelsKey,
    UnassignedSequenceNumber,
} from "@fluidframework/merge-tree";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { LoggingError } from "@fluidframework/telemetry-utils";
import { v4 as uuid } from "uuid";
import {
    IMapMessageLocalMetadata,
    IValueFactory,
    IValueOpEmitter,
    IValueOperation,
    IValueType,
    IValueTypeOperationValue,
} from "./defaultMapInterfaces";

const reservedIntervalIdKey = "intervalId";

export enum IntervalType {
    Simple = 0x0,
    Nest = 0x1,
    /**
     * SlideOnRemove indicates that the ends of the interval will slide if the segment
     * they reference is removed and acked.
     * See `packages\dds\merge-tree\REFERENCEPOSITIONS.md` for details
     * SlideOnRemove is the default interval behavior and does not need to be specified.
     */
    SlideOnRemove = 0x2, // SlideOnRemove is default behavior - all intervals are SlideOnRemove
    /**
     * @internal
     * A temporary interval, used internally
     */
    Transient = 0x4,
}

export interface ISerializedInterval {
    sequenceNumber: number;
    start: number;
    end: number;
    intervalType: IntervalType;
    properties?: PropertySet;
}

export interface ISerializableInterval extends IInterval {
    properties: PropertySet;
    propertyManager: PropertiesManager;
    serialize(client: Client): ISerializedInterval;
    addProperties(props: PropertySet, collaborating?: boolean, seq?: number):
        PropertySet | undefined;
    getIntervalId(): string | undefined;
}

export interface IIntervalHelpers<TInterval extends ISerializableInterval> {
    compareEnds(a: TInterval, b: TInterval): number;
    create(label: string, start: number, end: number,
        client: Client, intervalType?: IntervalType, op?: ISequencedDocumentMessage): TInterval;
}

export class Interval implements ISerializableInterval {
    public properties: PropertySet;
    public auxProps: PropertySet[];
    public propertyManager: PropertiesManager;
    constructor(
        public start: number,
        public end: number,
        props?: PropertySet) {
        if (props) {
            this.addProperties(props);
        }
    }

    public getIntervalId(): string | undefined {
        const id = this.properties?.[reservedIntervalIdKey];
        if (id === undefined) {
            return undefined;
        }
        return `${id}`;
    }

    public getAdditionalPropertySets() {
        return this.auxProps;
    }

    public addPropertySet(props: PropertySet) {
        if (this.auxProps === undefined) {
            this.auxProps = [];
        }
        this.auxProps.push(props);
    }

    public serialize(client: Client) {
        let seq = 0;
        if (client) {
            seq = client.getCurrentSeq();
        }

        const serializedInterval: ISerializedInterval = {
            end: this.end,
            intervalType: 0,
            sequenceNumber: seq,
            start: this.start,
        };
        if (this.properties) {
            serializedInterval.properties = this.properties;
        }
        return serializedInterval;
    }

    public clone() {
        return new Interval(this.start, this.end, this.properties);
    }

    public compare(b: Interval) {
        const startResult = this.compareStart(b);
        if (startResult === 0) {
            const endResult = this.compareEnd(b);
            if (endResult === 0) {
                const thisId = this.getIntervalId();
                if (thisId) {
                    const bId = b.getIntervalId();
                    if (bId) {
                        return thisId > bId ? 1 : thisId < bId ? -1 : 0;
                    }
                    return 0;
                }
                return 0;
            } else {
                return endResult;
            }
        } else {
            return startResult;
        }
    }

    public compareStart(b: Interval) {
        return this.start - b.start;
    }

    public compareEnd(b: Interval) {
        return this.end - b.end;
    }

    public overlaps(b: Interval) {
        const result = (this.start <= b.end) &&
            (this.end >= b.start);
        return result;
    }

    public union(b: Interval) {
        return new Interval(Math.min(this.start, b.start),
            Math.max(this.end, b.end), this.properties);
    }

    public getProperties() {
        return this.properties;
    }

    public addProperties(
        newProps: PropertySet,
        collaborating: boolean = false,
        seq?: number,
        op?: ICombiningOp,
    ): PropertySet | undefined {
        if (newProps) {
            if (!this.propertyManager) {
                this.propertyManager = new PropertiesManager();
            }
            if (!this.properties) {
                this.properties = createMap<any>();
            }
            return this.propertyManager.addProperties(this.properties, newProps, op, seq, collaborating);
        }
    }

    public modify(label: string, start: number, end: number, op?: ISequencedDocumentMessage) {
        const startPos = start ?? this.start;
        const endPos = end ?? this.end;
        if (this.start === startPos && this.end === endPos) {
            // Return undefined to indicate that no change is necessary.
            return;
        }
        const newInterval = new Interval(startPos, endPos);
        if (this.properties) {
            newInterval.properties = createMap<any>();
            this.propertyManager.copyTo(this.properties, newInterval.properties, newInterval.propertyManager);
        }
        return newInterval;
    }
}

/**
 * ISequenceIntervalEvents events should only be used internally in IntervalCollections.
 * SequenceInterval is exported as public so this must be too.
 */
export interface ISequenceIntervalEvents extends IEvent {
    (event: "beforePositionChange" | "afterPositionChange",
        listener: () => void);
}

export class SequenceInterval
extends TypedEventEmitter<ISequenceIntervalEvents>
implements ISerializableInterval {
    public properties: PropertySet;
    public propertyManager: PropertiesManager;

    constructor(
        public start: LocalReference,
        public end: LocalReference,
        public intervalType: IntervalType,
        props?: PropertySet) {
        super();
        if (props) {
            this.addProperties(props);
        }
        if (intervalType === IntervalType.SlideOnRemove) {
            this.prepareIntervalEventEmitter();
        }
    }

    private prepareIntervalEventEmitter() {
        const beforeSlide = () => {
            this.emit("beforePositionChange");
        };
        const afterSlide = () => {
            this.emit("afterPositionChange");
        };
        // Only listen to events from the positions when there is a listener on this.
        // This is particularly important since SequenceIntervals are cloned when put in the
        // interval trees and we don't want to listen on the clones.
        super.on("newListener", (event) => {
            switch (event) {
                case "beforePositionChange":
                    if (super.listenerCount(event) === 0) {
                        const startCb = this.start.callbacks ??= {};
                        startCb.beforeSlide = beforeSlide;
                        const endCb = this.end.callbacks ??= {};
                        endCb.beforeSlide = beforeSlide;
                    }
                    break;
                case "afterPositionChange":
                    if (super.listenerCount(event) === 0) {
                        const startCb = this.start.callbacks ??= {};
                        startCb.afterSlide = afterSlide;
                        const endCb = this.end.callbacks ??= {};
                        endCb.afterSlide = afterSlide;
                    }
                    break;
                default:
            }
        });
        super.on("removeListener", (event: string | symbol) => {
            switch (event) {
                case "beforePositionChange":
                    if (super.listenerCount(event) === 0) {
                        if (this.start.callbacks) {
                            this.start.callbacks.beforeSlide = undefined;
                        }
                        if (this.end.callbacks) {
                            this.end.callbacks.beforeSlide = undefined;
                        }
                    }
                    break;
                case "afterPositionChange":
                    if (super.listenerCount(event) === 0) {
                        if (this.start.callbacks) {
                            this.start.callbacks.afterSlide = undefined;
                        }
                        if (this.end.callbacks) {
                            this.end.callbacks.afterSlide = undefined;
                        }
                    }
                    break;
                default:
                    break;
            }
        });
    }

    public serialize(client: Client) {
        const startPosition = this.start.toPosition();
        const endPosition = this.end.toPosition();
        const serializedInterval: ISerializedInterval = {
            end: endPosition,
            intervalType: this.intervalType,
            sequenceNumber: client.getCurrentSeq(),
            start: startPosition,
        };
        if (this.properties) {
            serializedInterval.properties = this.properties;
        }
        return serializedInterval;
    }

    public clone() {
        return new SequenceInterval(this.start, this.end, this.intervalType, this.properties);
    }

    public compare(b: SequenceInterval) {
        const startResult = this.compareStart(b);
        if (startResult === 0) {
            const endResult = this.compareEnd(b);
            if (endResult === 0) {
                const thisId = this.getIntervalId();
                if (thisId) {
                    const bId = b.getIntervalId();
                    if (bId) {
                        return thisId > bId ? 1 : thisId < bId ? -1 : 0;
                    }
                    return 0;
                }
                return 0;
            } else {
                return endResult;
            }
        } else {
            return startResult;
        }
    }

    public compareStart(b: SequenceInterval) {
        return this.start.compare(b.start);
    }

    public compareEnd(b: SequenceInterval) {
        return this.end.compare(b.end);
    }

    public overlaps(b: SequenceInterval) {
        const result = (this.start.compare(b.end) <= 0) &&
            (this.end.compare(b.start) >= 0);
        return result;
    }

    public getIntervalId(): string | undefined {
        const id = this.properties?.[reservedIntervalIdKey];
        if (id === undefined) {
            return undefined;
        }
        return `${id}`;
    }

    public union(b: SequenceInterval) {
        return new SequenceInterval(this.start.min(b.start),
            this.end.max(b.end), this.intervalType);
    }

    public addProperties(
        newProps: PropertySet,
        collab: boolean = false,
        seq?: number,
        op?: ICombiningOp,
    ): PropertySet | undefined {
        if (!this.propertyManager) {
            this.propertyManager = new PropertiesManager();
        }
        if (!this.properties) {
            this.properties = createMap<any>();
        }
        return this.propertyManager.addProperties(this.properties, newProps, op, seq, collab);
    }

    public overlapsPos(bstart: number, bend: number) {
        const startPos = this.start.toPosition();
        const endPos = this.start.toPosition();
        return (endPos > bstart) && (startPos < bend);
    }

    public modify(label: string, start: number, end: number, op?: ISequencedDocumentMessage) {
        const startPos = start ?? this.start.toPosition();
        const endPos = end ?? this.end.toPosition();

        const newInterval =
            createSequenceInterval(label, startPos, endPos, this.start.getClient(), this.intervalType, op);
        if (this.properties) {
            newInterval.properties = createMap<any>();
            this.propertyManager.copyTo(this.properties, newInterval.properties, newInterval.propertyManager);
        }
        return newInterval;
    }
}

function createPositionReferenceFromSegoff(
    client: Client,
    segoff: { segment: ISegment | undefined; offset: number | undefined; },
    refType: ReferenceType,
    op?: ISequencedDocumentMessage): LocalReference {
    if (segoff.segment) {
        const ref = client.createLocalReferencePosition(segoff.segment, segoff.offset, refType, undefined);
        return ref as LocalReference;
    } else {
        if (!op && !refTypeIncludesFlag(refType, ReferenceType.Transient)) {
            throw new UsageError("Non-transient references need segment");
        }
        return new LocalReference(client, undefined, 0, refType);
    }
}

function createPositionReference(
    client: Client,
    pos: number,
    refType: ReferenceType,
    op?: ISequencedDocumentMessage): LocalReference {
    let segoff;
    if (op) {
        assert((refType & ReferenceType.SlideOnRemove) !== 0, 0x2f5 /* op create references must be SlideOnRemove */);
        segoff = client.getContainingSegment(pos, op);
        segoff = client.getSlideToSegment(segoff);
    } else {
        assert((refType & ReferenceType.SlideOnRemove) === 0, 0x2f6 /* SlideOnRemove references must be op created */);
        segoff = client.getContainingSegment(pos);
    }
    return createPositionReferenceFromSegoff(client, segoff, refType, op);
}

function createSequenceInterval(
    label: string,
    start: number,
    end: number,
    client: Client,
    intervalType?: IntervalType,
    op?: ISequencedDocumentMessage): SequenceInterval {
    let beginRefType = ReferenceType.RangeBegin;
    let endRefType = ReferenceType.RangeEnd;
    if (intervalType === IntervalType.Transient) {
        beginRefType = ReferenceType.Transient;
        endRefType = ReferenceType.Transient;
    } else {
        if (intervalType === IntervalType.Nest) {
            beginRefType = ReferenceType.NestBegin;
            endRefType = ReferenceType.NestEnd;
        }
        // All non-transient interval references must eventually be SlideOnRemove
        // To ensure eventual consistency, they must start as StayOnRemove when
        // pending (created locally and creation op is not acked)
        if (op) {
            beginRefType |= ReferenceType.SlideOnRemove;
            endRefType |= ReferenceType.SlideOnRemove;
        } else {
            beginRefType |= ReferenceType.StayOnRemove;
            endRefType |= ReferenceType.StayOnRemove;
        }
    }

    const startLref = createPositionReference(client, start, beginRefType, op);
    const endLref = createPositionReference(client, end, endRefType, op);
    startLref.pairedRef = endLref;
    endLref.pairedRef = startLref;
    const rangeProp = {
        [reservedRangeLabelsKey]: [label],
    };
    startLref.addProperties(rangeProp);
    endLref.addProperties(rangeProp);

    const ival = new SequenceInterval(startLref, endLref, intervalType, rangeProp);
    return ival;
}

export function defaultIntervalConflictResolver(a: Interval, b: Interval) {
    a.addPropertySet(b.properties);
    return a;
}

export function createIntervalIndex(conflict?: IntervalConflictResolver<Interval>) {
    const helpers: IIntervalHelpers<Interval> = {
        compareEnds: compareIntervalEnds,
        create: createInterval,
    };
    const lc = new LocalIntervalCollection<Interval>(undefined, "", helpers);
    if (conflict) {
        lc.addConflictResolver(conflict);
    } else {
        lc.addConflictResolver(defaultIntervalConflictResolver);
    }
    return lc;
}

export class LocalIntervalCollection<TInterval extends ISerializableInterval> {
    private readonly intervalTree = new IntervalTree<TInterval>();
    private readonly endIntervalTree: RedBlackTree<TInterval, TInterval>;
    private readonly intervalIdMap: Map<string, TInterval> = new Map();
    private conflictResolver: IntervalConflictResolver<TInterval>;
    private endConflictResolver: ConflictAction<TInterval, TInterval>;

    private static readonly legacyIdPrefix = "legacy";

    constructor(
        private readonly client: Client,
        private readonly label: string,
        private readonly helpers: IIntervalHelpers<TInterval>,
    ) {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        this.endIntervalTree = new RedBlackTree<TInterval, TInterval>(helpers.compareEnds);
    }

    public addConflictResolver(conflictResolver: IntervalConflictResolver<TInterval>) {
        this.conflictResolver = conflictResolver;
        this.endConflictResolver =
            (key: TInterval, currentKey: TInterval) => {
                const ival = this.conflictResolver(key, currentKey);
                return {
                    data: ival,
                    key: ival,
                };
            };
    }

    public map(fn: (interval: TInterval) => void) {
        this.intervalTree.map(fn);
    }

    public createLegacyId(start: number, end: number): string {
        // Create a non-unique ID based on start and end to be used on intervals that come from legacy clients
        // without ID's.
        return `${LocalIntervalCollection.legacyIdPrefix}${start}-${end}`;
    }

    public ensureSerializedId(serializedInterval: ISerializedInterval) {
        if (serializedInterval.properties?.[reservedIntervalIdKey] === undefined) {
            // An interval came over the wire without an ID, so create a non-unique one based on start/end.
            // This will allow all clients to refer to this interval consistently.
            const newProps = {
                [reservedIntervalIdKey]: this.createLegacyId(serializedInterval.start, serializedInterval.end),
            };
            serializedInterval.properties = addProperties(serializedInterval.properties, newProps);
        }
        // Make the ID immutable for safety's sake.
        Object.defineProperty(serializedInterval.properties, reservedIntervalIdKey, {
            configurable: false,
            enumerable: true,
            writable: false,
        });
    }

    public mapUntil(fn: (interval: TInterval) => boolean) {
        this.intervalTree.mapUntil(fn);
    }

    public gatherIterationResults(
        results: TInterval[],
        iteratesForward: boolean,
        start?: number,
        end?: number) {
        if (this.intervalTree.intervals.isEmpty()) {
            return;
        }

        if (start === undefined && end === undefined) {
            // No start/end provided. Gather the whole tree in the specified order.
            if (iteratesForward) {
                this.intervalTree.map((interval: TInterval) => {
                    results.push(interval);
                });
            } else {
                this.intervalTree.mapBackward((interval: TInterval) => {
                    results.push(interval);
                });
            }
        } else {
            const transientInterval: TInterval = this.helpers.create(
                "transient",
                start,
                end,
                this.client,
                IntervalType.Transient,
            );

            if (start === undefined) {
                // Only end position provided. Since the tree is not sorted by end position,
                // walk the whole tree in the specified order, gathering intervals that match the end.
                if (iteratesForward) {
                    this.intervalTree.map((interval: TInterval) => {
                        if (transientInterval.compareEnd(interval) === 0) {
                            results.push(interval);
                        }
                    });
                } else {
                    this.intervalTree.mapBackward((interval: TInterval) => {
                        if (transientInterval.compareEnd(interval) === 0) {
                            results.push(interval);
                        }
                    });
                }
            } else {
                // Start and (possibly) end provided. Walk the subtrees that may contain
                // this start position.
                const compareFn =
                    end === undefined ?
                        (node: IntervalNode<TInterval>) => {
                            return transientInterval.compareStart(node.key);
                        } :
                        (node: IntervalNode<TInterval>) => {
                            return transientInterval.compare(node.key);
                        };
                const continueLeftFn = (cmpResult: number) => cmpResult <= 0;
                const continueRightFn = (cmpResult: number) => cmpResult >= 0;
                const actionFn = (node: IntervalNode<TInterval>) => {
                    results.push(node.key);
                };

                if (iteratesForward) {
                    this.intervalTree.intervals.walkExactMatchesForward(
                        compareFn, actionFn, continueLeftFn, continueRightFn,
                    );
                } else {
                    this.intervalTree.intervals.walkExactMatchesBackward(
                        compareFn, actionFn, continueLeftFn, continueRightFn,
                    );
                }
            }
        }
    }

    public findOverlappingIntervals(startPosition: number, endPosition: number) {
        if (endPosition < startPosition || this.intervalTree.intervals.isEmpty()) {
            return [];
        }
        const transientInterval =
            this.helpers.create(
                "transient",
                startPosition,
                endPosition,
                this.client,
                IntervalType.Transient);

        const overlappingIntervalNodes = this.intervalTree.match(transientInterval);
        return overlappingIntervalNodes.map((node) => node.key);
    }

    public previousInterval(pos: number) {
        const transientInterval = this.helpers.create(
            "transient", pos, pos, this.client, IntervalType.Transient);
        const rbNode = this.endIntervalTree.floor(transientInterval);
        if (rbNode) {
            return rbNode.data;
        }
    }

    public nextInterval(pos: number) {
        const transientInterval = this.helpers.create(
            "transient", pos, pos, this.client, IntervalType.Transient);
        const rbNode = this.endIntervalTree.ceil(transientInterval);
        if (rbNode) {
            return rbNode.data;
        }
    }

    public removeInterval(startPosition: number, endPosition: number) {
        const transientInterval = this.helpers.create(
            "transient", startPosition, endPosition, this.client, IntervalType.Transient);
        this.intervalTree.remove(transientInterval);
        this.endIntervalTree.remove(transientInterval);
        return transientInterval;
    }

    private removeIntervalFromIndex(interval: TInterval) {
        this.intervalTree.removeExisting(interval);
        this.endIntervalTree.remove(interval);
        this.intervalIdMap.delete(interval.getIntervalId());
    }

    public removeExistingInterval(interval: TInterval) {
        this.removeIntervalFromIndex(interval);
        this.removeIntervalListeners(interval);
    }

    public createInterval(
        start: number,
        end: number,
        intervalType: IntervalType,
        op?: ISequencedDocumentMessage): TInterval {
        return this.helpers.create(this.label, start, end, this.client, intervalType, op);
    }

    public addInterval(
        start: number,
        end: number,
        intervalType: IntervalType,
        props?: PropertySet,
        op?: ISequencedDocumentMessage) {
        const interval: TInterval = this.createInterval(start, end, intervalType, op);
        if (interval) {
            if (!interval.properties) {
                interval.properties = createMap<any>();
            }
            if (props) {
                interval.addProperties(props);
            }
            if (interval.properties[reservedIntervalIdKey] === undefined) {
                // Create a new ID.
                interval.properties[reservedIntervalIdKey] = uuid();
            }
            this.add(interval);
        }
        return interval;
    }

    private addIntervalToIndex(interval: TInterval) {
        assert(Object.prototype.hasOwnProperty.call(interval.properties, reservedIntervalIdKey),
            0x2c0 /* "ID must be created before adding interval to collection" */);
        // Make the ID immutable.
        Object.defineProperty(interval.properties, reservedIntervalIdKey, {
            configurable: false,
            enumerable: true,
            writable: false,
        });
        this.intervalTree.put(interval, this.conflictResolver);
        this.endIntervalTree.put(interval, interval, this.endConflictResolver);
        this.intervalIdMap.set(interval.getIntervalId(), interval);
    }

    public add(interval: TInterval) {
        this.addIntervalToIndex(interval);
        this.addIntervalListeners(interval);
    }

    public getIntervalById(id: string) {
        return this.intervalIdMap.get(id);
    }

    public changeInterval(interval: TInterval, start: number, end: number, op?: ISequencedDocumentMessage) {
        const newInterval = interval.modify(this.label, start, end, op) as TInterval | undefined;
        if (newInterval) {
            this.removeExistingInterval(interval);
            this.add(newInterval);
        }
        return newInterval;
    }

    public serialize() {
        const client = this.client;
        const intervals = this.intervalTree.intervals.keys();
        return intervals.map((interval) => interval.serialize(client));
    }

    private addIntervalListeners(interval: TInterval) {
        if (interval instanceof SequenceInterval) {
            interval.on("beforePositionChange", () => this.removeIntervalFromIndex(interval));
            interval.on("afterPositionChange", () => this.addIntervalToIndex(interval));
        }
    }

    private removeIntervalListeners(interval: TInterval) {
        if (interval instanceof SequenceInterval) {
            interval.removeAllListeners("beforePositionChange");
            interval.removeAllListeners("afterPositionChange");
        }
    }
}

const compareSequenceIntervalEnds = (a: SequenceInterval, b: SequenceInterval): number => a.end.compare(b.end);

class SequenceIntervalCollectionFactory
    implements IValueFactory<IntervalCollection<SequenceInterval>> {
    public load(
        emitter: IValueOpEmitter,
        raw: ISerializedInterval[] = [],
    ): IntervalCollection<SequenceInterval> {
        const helpers: IIntervalHelpers<SequenceInterval> = {
            compareEnds: compareSequenceIntervalEnds,
            create: createSequenceInterval,
        };
        return new IntervalCollection<SequenceInterval>(helpers, true, emitter, raw);
    }

    public store(value: IntervalCollection<SequenceInterval>): ISerializedInterval[] {
        return value.serializeInternal();
    }
}

export class SequenceIntervalCollectionValueType
    implements IValueType<IntervalCollection<SequenceInterval>> {
    public static Name = "sharedStringIntervalCollection";

    public get name(): string {
        return SequenceIntervalCollectionValueType.Name;
    }

    public get factory(): IValueFactory<IntervalCollection<SequenceInterval>> {
        return SequenceIntervalCollectionValueType._factory;
    }

    public get ops(): Map<string, IValueOperation<IntervalCollection<SequenceInterval>>> {
        return SequenceIntervalCollectionValueType._ops;
    }

    private static readonly _factory: IValueFactory<IntervalCollection<SequenceInterval>> =
        new SequenceIntervalCollectionFactory();

    private static readonly _ops = makeOpsMap<SequenceInterval>();
}

const compareIntervalEnds = (a: Interval, b: Interval) => a.end - b.end;

function createInterval(label: string, start: number, end: number, client: Client): Interval {
    let rangeProp: PropertySet;
    if (label && (label.length > 0)) {
        rangeProp = {
            [reservedRangeLabelsKey]: [label],
        };
    }
    return new Interval(start, end, rangeProp);
}

class IntervalCollectionFactory
    implements IValueFactory<IntervalCollection<Interval>> {
    public load(emitter: IValueOpEmitter, raw: ISerializedInterval[] = []): IntervalCollection<Interval> {
        const helpers: IIntervalHelpers<Interval> = {
            compareEnds: compareIntervalEnds,
            create: createInterval,
        };
        const collection = new IntervalCollection<Interval>(helpers, false, emitter, raw);
        collection.attachGraph(undefined, "");
        return collection;
    }

    public store(value: IntervalCollection<Interval>): ISerializedInterval[] {
        return value.serializeInternal();
    }
}

export class IntervalCollectionValueType
    implements IValueType<IntervalCollection<Interval>> {
    public static Name = "sharedIntervalCollection";

    public get name(): string {
        return IntervalCollectionValueType.Name;
    }

    public get factory(): IValueFactory<IntervalCollection<Interval>> {
        return IntervalCollectionValueType._factory;
    }

    public get ops(): Map<string, IValueOperation<IntervalCollection<Interval>>> {
        return IntervalCollectionValueType._ops;
    }

    private static readonly _factory: IValueFactory<IntervalCollection<Interval>> =
        new IntervalCollectionFactory();
    private static readonly _ops = makeOpsMap<Interval>();
}

function makeOpsMap<T extends ISerializableInterval>(): Map<string, IValueOperation<IntervalCollection<T>>> {
    const rebase = (
        collection: IntervalCollection<T>,
        op: IValueTypeOperationValue,
        localOpMetadata: IMapMessageLocalMetadata,
    ) => {
        const { localSeq } = localOpMetadata;
        const rebasedValue = collection.rebaseLocalInterval(op.opName, op.value, localSeq);
        const rebasedOp = { ...op, value: rebasedValue };
        return { rebasedOp, rebasedLocalOpMetadata: localOpMetadata };
    };

    return new Map<string, IValueOperation<IntervalCollection<T>>>(
        [[
            "add",
            {
                process: (collection, params, local, op) => {
                    collection.ackAdd(params, local, op);
                },
                rebase,
            },
        ],
        [
            "delete",
            {
                process: (collection, params, local, op) => {
                    collection.ackDelete(params, local, op);
                },
                rebase: (collection, op, localOpMetadata) => {
                    // Deletion of intervals is based on id, so requires no rebasing.
                    return { rebasedOp: op, rebasedLocalOpMetadata: localOpMetadata };
                },
            },
        ],
        [
            "change",
            {
                process: (collection, params, local, op) => {
                    collection.ackChange(params, local, op);
                },
                rebase,
            },
        ]]);
}

export type DeserializeCallback = (properties: PropertySet) => void;

export class IntervalCollectionIterator<TInterval extends ISerializableInterval> {
    private readonly results: TInterval[];
    private index: number;

    constructor(
        collection: IntervalCollection<TInterval>,
        iteratesForward: boolean = true,
        start?: number,
        end?: number) {
        this.results = [];
        this.index = 0;

        collection.gatherIterationResults(this.results, iteratesForward, start, end);
    }

    public next() {
        let _value: TInterval | undefined;
        let _done: boolean = true;

        if (this.index < this.results.length) {
            _value = this.results[this.index++];
            _done = false;
        }

        return {
            value: _value,
            done: _done,
        };
    }
}

export interface IIntervalCollectionEvent<TInterval extends ISerializableInterval> extends IEvent {
    (event: "addInterval" | "changeInterval" | "deleteInterval",
        listener: (interval: TInterval, local: boolean, op: ISequencedDocumentMessage) => void);
    (event: "propertyChanged", listener: (interval: TInterval, propertyArgs: PropertySet) => void);
}

export class IntervalCollection<TInterval extends ISerializableInterval>
    extends TypedEventEmitter<IIntervalCollectionEvent<TInterval>> {
    private savedSerializedIntervals?: ISerializedInterval[];
    private localCollection: LocalIntervalCollection<TInterval>;
    private onDeserialize: DeserializeCallback;
    private client: Client;
    private pendingChangesStart: Map<string, ISerializedInterval[]>;
    private pendingChangesEnd: Map<string, ISerializedInterval[]>;

    public get attached(): boolean {
        return !!this.localCollection;
    }

    /** @internal */
    constructor(private readonly helpers: IIntervalHelpers<TInterval>, private readonly requiresClient: boolean,
        private readonly emitter: IValueOpEmitter,
        serializedIntervals: ISerializedInterval[]) {
        super();
        this.savedSerializedIntervals = serializedIntervals;
    }

    public attachGraph(client: Client, label: string) {
        if (this.attached) {
            throw new LoggingError("Only supports one Sequence attach");
        }

        if ((client === undefined) && (this.requiresClient)) {
            throw new LoggingError("Client required for this collection");
        }

        // Instantiate the local interval collection based on the saved intervals
        this.client = client;
        this.localCollection = new LocalIntervalCollection<TInterval>(client, label, this.helpers);
        if (this.savedSerializedIntervals) {
            for (const serializedInterval of this.savedSerializedIntervals) {
                this.localCollection.ensureSerializedId(serializedInterval);
                this.localCollection.addInterval(
                    serializedInterval.start,
                    serializedInterval.end,
                    serializedInterval.intervalType,
                    serializedInterval.properties);
            }
        }
        this.savedSerializedIntervals = undefined;
    }

    /**
     * Gets the next local sequence number, modifying this client's collab window in doing so.
     */
    private getNextLocalSeq(): number {
        return ++this.client.getCollabWindow().localSeq;
    }

    public getIntervalById(id: string) {
        if (!this.attached) {
            throw new LoggingError("attach must be called before accessing intervals");
        }
        return this.localCollection.getIntervalById(id);
    }

    /**
     * Create a new interval and add it to the collection
     * @param start - interval start position
     * @param end - interval end position
     * @param intervalType - type of the interval. All intervals are SlideOnRemove. Intervals may not be Transient.
     * @param props - properties of the interval
     * @returns - the created interval
     */
    public add(
        start: number,
        end: number,
        intervalType: IntervalType,
        props?: PropertySet,
    ) {
        if (!this.attached) {
            throw new LoggingError("attach must be called prior to adding intervals");
        }
        if (intervalType & IntervalType.Transient) {
            throw new LoggingError("Can not add transient intervals");
        }

        const interval: TInterval = this.localCollection.addInterval(start, end, intervalType, props);

        if (interval) {
            const serializedInterval = {
                end,
                intervalType,
                properties: interval.properties,
                sequenceNumber: this.client?.getCurrentSeq() ?? 0,
                start,
            };
            // Local ops get submitted to the server. Remote ops have the deserializer run.
            this.emitter.emit("add", undefined, serializedInterval, { localSeq: this.getNextLocalSeq() });
        }

        this.emit("addInterval", interval, true, undefined);

        return interval;
    }

    private deleteExistingInterval(interval: TInterval, local: boolean, op: ISequencedDocumentMessage) {
        // The given interval is known to exist in the collection.
        this.localCollection.removeExistingInterval(interval);

        if (interval) {
            // Local ops get submitted to the server. Remote ops have the deserializer run.
            if (local) {
                this.emitter.emit(
                    "delete",
                    undefined,
                    interval.serialize(this.client),
                    { localSeq: this.getNextLocalSeq() },
                );
            } else {
                if (this.onDeserialize) {
                    this.onDeserialize(interval);
                }
            }
        }

        this.emit("deleteInterval", interval, local, op);
    }

    public removeIntervalById(id: string) {
        const interval = this.localCollection.getIntervalById(id);
        if (interval) {
            this.deleteExistingInterval(interval, true, undefined);
        }
        return interval;
    }

    public changeProperties(id: string, props: PropertySet) {
        if (!this.attached) {
            throw new LoggingError("Attach must be called before accessing intervals");
        }
        if (typeof (id) !== "string") {
            throw new LoggingError("Change API requires an ID that is a string");
        }
        if (!props) {
            throw new LoggingError("changeProperties should be called with a property set");
        }

        const interval = this.getIntervalById(id);
        if (interval) {
            // Pass Unassigned as the sequence number to indicate that this is a local op that is waiting for an ack.
            const deltaProps = interval.addProperties(props, true, UnassignedSequenceNumber);
            const serializedInterval: ISerializedInterval = interval.serialize(this.client);
            // Emit a change op that will only change properties. Add the ID to the property bag provided by the caller.
            serializedInterval.start = undefined;
            serializedInterval.end = undefined;
            serializedInterval.properties = props;
            serializedInterval.properties[reservedIntervalIdKey] = interval.getIntervalId();
            this.emitter.emit("change", undefined, serializedInterval, { localSeq: this.getNextLocalSeq() });
            this.emit("propertyChanged", interval, deltaProps);
        }
        this.emit("changeInterval", interval, true, undefined);
    }

    public change(id: string, start?: number, end?: number): TInterval | undefined {
        if (!this.attached) {
            throw new LoggingError("Attach must be called before accessing intervals");
        }
        if (typeof (id) !== "string") {
            throw new LoggingError("Change API requires an ID that is a string");
        }

        // Force id to be a string.
        const interval = this.getIntervalById(id);
        if (interval) {
            this.localCollection.changeInterval(interval, start, end);
            const serializedInterval: ISerializedInterval = interval.serialize(this.client);
            serializedInterval.start = start;
            serializedInterval.end = end;
            // Emit a property bag containing only the ID, as we don't intend for this op to change any properties.
            serializedInterval.properties =
                {
                    [reservedIntervalIdKey]: interval.getIntervalId(),
                };
            this.emitter.emit("change", undefined, serializedInterval, { localSeq: this.getNextLocalSeq() });
            this.addPendingChange(id, serializedInterval);
        }
        this.emit("changeInterval", interval, true, undefined);
        return interval;
    }

    private addPendingChange(id: string, serializedInterval: ISerializedInterval) {
        if (serializedInterval.start !== undefined) {
            if (!this.pendingChangesStart) {
                this.pendingChangesStart = new Map<string, ISerializedInterval[]>();
            }
            this.addPendingChangeHelper(id, this.pendingChangesStart, serializedInterval);
        }
        if (serializedInterval.end !== undefined) {
            if (!this.pendingChangesEnd) {
                this.pendingChangesEnd = new Map<string, ISerializedInterval[]>();
            }
            this.addPendingChangeHelper(id, this.pendingChangesEnd, serializedInterval);
        }
    }

    private addPendingChangeHelper(
        id: string,
        pendingChanges: Map<string, ISerializedInterval[]>,
        serializedInterval: ISerializedInterval,
    ) {
        let entries: ISerializedInterval[] = pendingChanges.get(id);
        if (!entries) {
            entries = [];
            pendingChanges.set(id, entries);
        }
        entries.push(serializedInterval);
    }

    private removePendingChange(serializedInterval: ISerializedInterval) {
        // Change ops always have an ID.
        const id: string = serializedInterval.properties[reservedIntervalIdKey];
        if (serializedInterval.start !== undefined) {
            this.removePendingChangeHelper(id, this.pendingChangesStart, serializedInterval);
        }
        if (serializedInterval.end !== undefined) {
            this.removePendingChangeHelper(id, this.pendingChangesEnd, serializedInterval);
        }
    }

    private removePendingChangeHelper(
        id: string,
        pendingChanges: Map<string, ISerializedInterval[]>,
        serializedInterval: ISerializedInterval,
    ) {
        const entries = pendingChanges?.get(id);
        if (entries) {
            const pendingChange = entries.shift();
            if (entries.length === 0) {
                pendingChanges.delete(id);
            }
            if (pendingChange.start !== serializedInterval.start ||
                pendingChange.end !== serializedInterval.end) {
                throw new LoggingError("Mismatch in pending changes");
            }
        }
    }

    private hasPendingChangeStart(id: string) {
        const entries = this.pendingChangesStart?.get(id);
        return entries && entries.length !== 0;
    }

    private hasPendingChangeEnd(id: string) {
        const entries = this.pendingChangesEnd?.get(id);
        return entries && entries.length !== 0;
    }

    /** @deprecated - use ackChange */
    public changeInterval(serializedInterval: ISerializedInterval, local: boolean, op: ISequencedDocumentMessage) {
        return this.ackChange(serializedInterval, local, op);
    }

    /** @internal */
    public ackChange(serializedInterval: ISerializedInterval, local: boolean, op: ISequencedDocumentMessage) {
        if (!this.attached) {
            throw new LoggingError("Attach must be called before accessing intervals");
        }

        let interval: TInterval | undefined;

        if (local) {
            // This is an ack from the server. Remove the pending change.
            this.removePendingChange(serializedInterval);
            const id: string = serializedInterval.properties[reservedIntervalIdKey];
            interval = this.getIntervalById(id);
            if (interval) {
                // Let the propertyManager prune its pending change-properties set.
                interval.propertyManager?.ackPendingProperties(
                    {
                        type: MergeTreeDeltaType.ANNOTATE,
                        props: serializedInterval.properties,
                    });

                this.ackInterval(interval, op);
            }
        } else {
            // If there are pending changes with this ID, don't apply the remote start/end change, as the local ack
            // should be the winning change.
            // Note that the ID is in the property bag only to allow us to find the interval.
            // This API cannot change the ID, and writing to the ID property will result in an exception. So we
            // strip it out of the properties here.
            const { [reservedIntervalIdKey]: id, ...newProps } = serializedInterval.properties;
            interval = this.getIntervalById(id);
            if (interval) {
                let start: number | undefined;
                let end: number | undefined;
                // Track pending start/end independently of one another.
                if (!this.hasPendingChangeStart(id)) {
                    start = serializedInterval.start;
                }
                if (!this.hasPendingChangeEnd(id)) {
                    end = serializedInterval.end;
                }
                if (start !== undefined || end !== undefined) {
                    // If changeInterval gives us a new interval, work with that one. Otherwise keep working with
                    // the one we originally found in the tree.
                    interval = this.localCollection.changeInterval(interval, start, end, op) ?? interval;
                }
                const deltaProps = interval.addProperties(newProps, true, op.sequenceNumber);
                if (this.onDeserialize) {
                    this.onDeserialize(interval);
                }
                this.emit("propertyChanged", interval, deltaProps);
            }
        }
        if (interval) {
            this.emit("changeInterval", interval, local, op);
        }
    }

    public addConflictResolver(conflictResolver: IntervalConflictResolver<TInterval>): void {
        if (!this.attached) {
            throw new LoggingError("attachSequence must be called");
        }
        this.localCollection.addConflictResolver(conflictResolver);
    }

    public attachDeserializer(onDeserialize: DeserializeCallback): void {
        // If no deserializer is specified can skip all processing work
        if (!onDeserialize) {
            return;
        }

        // Start by storing the callbacks so that any subsequent modifications make use of them
        this.onDeserialize = onDeserialize;

        // Trigger the async prepare work across all values in the collection
        this.localCollection.map((interval) => {
            this.onDeserialize(interval);
        });
    }

    /** @internal */
    public rebaseLocalInterval(
        opName: string,
        serializedInterval: ISerializedInterval,
        localSeq: number,
    ) {
        if (!this.attached) {
            throw new LoggingError("attachSequence must be called");
        }

        const { start, end, intervalType, properties, sequenceNumber } = serializedInterval;
        const startRebased = start === undefined ? undefined :
            this.client.rebasePosition(start, sequenceNumber, localSeq);
        const endRebased = end === undefined ? undefined :
            this.client.rebasePosition(end, sequenceNumber, localSeq);

        const intervalId = properties[reservedIntervalIdKey];
        const rebased: ISerializedInterval = {
            start: startRebased,
            end: endRebased,
            intervalType,
            sequenceNumber: this.client?.getCurrentSeq() ?? 0,
            properties,
        };
        if (opName === "change" && (this.hasPendingChangeStart(intervalId) || this.hasPendingChangeEnd(intervalId))) {
            this.removePendingChange(serializedInterval);
            this.addPendingChange(intervalId, rebased);
        }
        return rebased;
    }

    private getSlideToSegment(lref: LocalReference) {
        const segoff = { segment: lref.segment, offset: lref.offset };
        const newSegoff = this.client.getSlideToSegment(segoff);
        const value: { segment: ISegment | undefined; offset: number | undefined; } | undefined
            = (segoff.segment === newSegoff.segment && segoff.offset === newSegoff.offset) ? undefined : newSegoff;
        return value;
    }

    private setSlideOnRemove(lref: LocalReference) {
        let refType = lref.refType;
        refType = refType & ~ReferenceType.StayOnRemove;
        refType = refType | ReferenceType.SlideOnRemove;
        lref.refType = refType;
    }

    private ackInterval(interval: TInterval, op: ISequencedDocumentMessage) {
        // in current usage, interval is always a SequenceInterval
        if (!(interval instanceof SequenceInterval)) {
            return;
        }

        if (!refTypeIncludesFlag(interval.start, ReferenceType.StayOnRemove) &&
            !refTypeIncludesFlag(interval.end, ReferenceType.StayOnRemove)) {
            return;
        }

        const newStart = this.getSlideToSegment(interval.start);
        const newEnd = this.getSlideToSegment(interval.end);

        const id = interval.properties[reservedIntervalIdKey];
        const hasPendingStartChange = this.hasPendingChangeStart(id);
        const hasPendingEndChange = this.hasPendingChangeEnd(id);

        if (!hasPendingStartChange) {
            this.setSlideOnRemove(interval.start);
        }

        if (!hasPendingEndChange) {
            this.setSlideOnRemove(interval.end);
        }

        const needsStartUpdate = newStart !== undefined && !hasPendingStartChange;
        const needsEndUpdate = newEnd !== undefined && !hasPendingEndChange;

        if (needsStartUpdate || needsEndUpdate) {
            // In this case, where we change the start or end of an interval,
            // it is necessary to remove and re-add the interval listeners.
            // This ensures that the correct listeners are added to the ReferencePosition.
            this.localCollection.removeExistingInterval(interval);

            if (needsStartUpdate) {
                const props = interval.start.properties;
                this.client.removeLocalReferencePosition(interval.start);
                interval.start = createPositionReferenceFromSegoff(this.client, newStart, interval.start.refType, op);
                interval.start.addProperties(props);
            }
            if (needsEndUpdate) {
                const props = interval.end.properties;
                this.client.removeLocalReferencePosition(interval.end);
                interval.end = createPositionReferenceFromSegoff(this.client, newEnd, interval.end.refType, op);
                interval.end.addProperties(props);
            }
            this.localCollection.add(interval);
        }
    }

    /** @deprecated - use ackAdd */
    public addInternal(
        serializedInterval: ISerializedInterval,
        local: boolean,
        op: ISequencedDocumentMessage) {
        return this.ackAdd(serializedInterval, local, op);
    }

    /** @internal */
    public ackAdd(
        serializedInterval: ISerializedInterval,
        local: boolean,
        op: ISequencedDocumentMessage) {
        if (local) {
            const id: string = serializedInterval.properties[reservedIntervalIdKey];
            const localInterval = this.getIntervalById(id);
            if (localInterval) {
                this.ackInterval(localInterval, op);
            }
            return;
        }

        if (!this.attached) {
            throw new LoggingError("attachSequence must be called");
        }

        this.localCollection.ensureSerializedId(serializedInterval);

        const interval: TInterval = this.localCollection.addInterval(
            serializedInterval.start,
            serializedInterval.end,
            serializedInterval.intervalType,
            serializedInterval.properties,
            op);

        if (interval) {
            if (this.onDeserialize) {
                this.onDeserialize(interval);
            }
        }

        this.emit("addInterval", interval, local, op);

        return interval;
    }

    /** @deprecated - use ackDelete */
    public deleteInterval(
        serializedInterval: ISerializedInterval,
        local: boolean,
        op: ISequencedDocumentMessage): void {
        return this.ackDelete(serializedInterval, local, op);
    }

    /** @internal */
    public ackDelete(
        serializedInterval: ISerializedInterval,
        local: boolean,
        op: ISequencedDocumentMessage): void {
        if (local) {
            // Local ops were applied when the message was created and there's no "pending delete"
            // state to bookkeep: remote operation application takes into account possibility of
            // locally deleted interval whenever a lookup happens.
            return;
        }

        if (!this.attached) {
            throw new LoggingError("attach must be called prior to deleting intervals");
        }

        this.localCollection.ensureSerializedId(serializedInterval);
        const interval = this.localCollection.getIntervalById(serializedInterval.properties[reservedIntervalIdKey]);
        if (interval) {
            this.deleteExistingInterval(interval, local, op);
        }
    }

    public serializeInternal() {
        if (!this.attached) {
            throw new LoggingError("attachSequence must be called");
        }

        return this.localCollection.serialize();
    }

    public [Symbol.iterator](): IntervalCollectionIterator<TInterval> {
        const iterator = new IntervalCollectionIterator<TInterval>(this);
        return iterator;
    }

    public CreateForwardIteratorWithStartPosition(startPosition: number): IntervalCollectionIterator<TInterval> {
        const iterator = new IntervalCollectionIterator<TInterval>(this, true, startPosition);
        return iterator;
    }

    public CreateBackwardIteratorWithStartPosition(startPosition: number): IntervalCollectionIterator<TInterval> {
        const iterator = new IntervalCollectionIterator<TInterval>(this, false, startPosition);
        return iterator;
    }

    public CreateForwardIteratorWithEndPosition(endPosition: number): IntervalCollectionIterator<TInterval> {
        const iterator = new IntervalCollectionIterator<TInterval>(this, true, undefined, endPosition);
        return iterator;
    }

    public CreateBackwardIteratorWithEndPosition(endPosition: number): IntervalCollectionIterator<TInterval> {
        const iterator = new IntervalCollectionIterator<TInterval>(this, false, undefined, endPosition);
        return iterator;
    }

    public gatherIterationResults(
        results: TInterval[],
        iteratesForward: boolean,
        start?: number,
        end?: number) {
        if (!this.attached) {
            return;
        }

        this.localCollection.gatherIterationResults(results, iteratesForward, start, end);
    }

    public findOverlappingIntervals(startPosition: number, endPosition: number): TInterval[] {
        if (!this.attached) {
            throw new LoggingError("attachSequence must be called");
        }

        return this.localCollection.findOverlappingIntervals(startPosition, endPosition);
    }

    public map(fn: (interval: TInterval) => void) {
        if (!this.attached) {
            throw new LoggingError("attachSequence must be called");
        }

        this.localCollection.map(fn);
    }

    public previousInterval(pos: number): TInterval {
        if (!this.attached) {
            throw new LoggingError("attachSequence must be called");
        }

        return this.localCollection.previousInterval(pos);
    }

    public nextInterval(pos: number): TInterval {
        if (!this.attached) {
            throw new LoggingError("attachSequence must be called");
        }

        return this.localCollection.nextInterval(pos);
    }
}

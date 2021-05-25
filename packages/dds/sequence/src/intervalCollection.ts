/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { EventEmitter } from "events";
import { IValueFactory, IValueOpEmitter, IValueOperation, IValueType } from "@fluidframework/map";
import * as MergeTree from "@fluidframework/merge-tree";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { v4 as uuid } from "uuid";

const reservedIntervalIdKey = "intervalId";

export interface ISerializedInterval {
    sequenceNumber: number;
    start: number;
    end: number;
    intervalType: MergeTree.IntervalType;
    properties?: MergeTree.PropertySet;
}

export interface ISerializableInterval extends MergeTree.IInterval {
    properties: MergeTree.PropertySet;
    serialize(client: MergeTree.Client);
    addProperties(props: MergeTree.PropertySet);
}

export interface IIntervalHelpers<TInterval extends ISerializableInterval> {
    compareEnds(a: TInterval, b: TInterval): number;
    create(label: string, start: number, end: number,
        client: MergeTree.Client, intervalType?: MergeTree.IntervalType): TInterval;
}

export class Interval implements ISerializableInterval {
    public properties: MergeTree.PropertySet;
    public auxProps: MergeTree.PropertySet[];
    constructor(
        public start: number,
        public end: number,
        props?: MergeTree.PropertySet) {
        if (props) {
            this.addProperties(props);
        }
    }

    public getIntervalId(): string | undefined {
        if (this.properties) {
            const id = this.properties[reservedIntervalIdKey];
            if (id !== undefined) {
                return id.toString() as string;
            }
        }
    }

    public getAdditionalPropertySets() {
        return this.auxProps;
    }

    public addPropertySet(props: MergeTree.PropertySet) {
        if (this.auxProps === undefined) {
            this.auxProps = [];
        }
        this.auxProps.push(props);
    }

    public serialize(client: MergeTree.Client) {
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
            return this.compareEnd(b);
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
        const result = (this.start < b.end) &&
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

    public addProperties(newProps: MergeTree.PropertySet, op?: MergeTree.ICombiningOp) {
        this.properties = MergeTree.addProperties(this.properties, newProps, op);
    }
}

export class SequenceInterval implements ISerializableInterval {
    public properties: MergeTree.PropertySet;
    private readonly checkMergeTree: MergeTree.MergeTree;

    constructor(
        public start: MergeTree.LocalReference,
        public end: MergeTree.LocalReference,
        public intervalType: MergeTree.IntervalType,
        props?: MergeTree.PropertySet) {
        if (props) {
            this.addProperties(props);
        }
    }

    public serialize(client: MergeTree.Client) {
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
        return new SequenceInterval(this.start, this.end, this.intervalType);
    }

    public compare(b: SequenceInterval) {
        const startResult = this.compareStart(b);
        if (startResult === 0) {
            return this.compareEnd(b);
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
        const result = (this.start.compare(b.end) < 0) &&
            (this.end.compare(b.start) >= 0);
        if (this.checkMergeTree) {
            this.checkOverlaps(b, result);
        }
        return result;
    }

    public getIntervalId(): string | undefined {
        if (this.properties) {
            const id = this.properties[reservedIntervalIdKey];
            if (id !== undefined) {
                return id.toString() as string;
            }
        }
    }

    public union(b: SequenceInterval) {
        return new SequenceInterval(this.start.min(b.start),
            this.end.max(b.end), this.intervalType);
    }

    public addProperties(newProps: MergeTree.PropertySet, op?: MergeTree.ICombiningOp) {
        this.properties = MergeTree.addProperties(this.properties, newProps, op);
    }

    public overlapsPos(bstart: number, bend: number) {
        const startPos = this.start.toPosition();
        const endPos = this.start.toPosition();
        return (endPos > bstart) && (startPos < bend);
    }

    private checkOverlaps(b: SequenceInterval, result: boolean) {
        const astart = this.start.toPosition();
        const bstart = b.start.toPosition();
        const aend = this.end.toPosition();
        const bend = b.end.toPosition();
        const checkResult = ((astart < bend) && (bstart < aend));
        if (checkResult !== result) {
            // eslint-disable-next-line max-len
            console.log(`check mismatch: res ${result} ${this.start.segment === b.end.segment} ${b.start.segment === this.end.segment}`);
            console.log(`as ${astart} ae ${aend} bs ${bstart} be ${bend}`);
            console.log(`as ${MergeTree.ordinalToArray(this.start.segment.ordinal)}@${this.start.offset}`);
            console.log(`ae ${MergeTree.ordinalToArray(this.end.segment.ordinal)}@${this.end.offset}`);
            console.log(`bs ${MergeTree.ordinalToArray(b.start.segment.ordinal)}@${b.start.offset}`);
            console.log(`be ${MergeTree.ordinalToArray(b.end.segment.ordinal)}@${b.end.offset}`);
            console.log(this.checkMergeTree.nodeToString(b.start.segment.parent, ""));
        }
    }
}

function createPositionReference(
    client: MergeTree.Client,
    pos: number,
    refType: MergeTree.ReferenceType): MergeTree.LocalReference {
    const segoff = client.getContainingSegment(pos);
    if (segoff && segoff.segment) {
        const lref = new MergeTree.LocalReference(client, segoff.segment, segoff.offset, refType);
        if (refType !== MergeTree.ReferenceType.Transient) {
            client.addLocalReference(lref);
        }
        return lref;
    }
    return new MergeTree.LocalReference(client, undefined);
}

function createSequenceInterval(
    label: string,
    start: number,
    end: number,
    client: MergeTree.Client,
    intervalType: MergeTree.IntervalType): SequenceInterval {
    let beginRefType = MergeTree.ReferenceType.RangeBegin;
    let endRefType = MergeTree.ReferenceType.RangeEnd;
    if (intervalType === MergeTree.IntervalType.Nest) {
        beginRefType = MergeTree.ReferenceType.NestBegin;
        endRefType = MergeTree.ReferenceType.NestEnd;
    } else if (intervalType === MergeTree.IntervalType.Transient) {
        beginRefType = MergeTree.ReferenceType.Transient;
        endRefType = MergeTree.ReferenceType.Transient;
    }

    // TODO: Should SlideOnRemove be the default behavior?
    if (intervalType & MergeTree.IntervalType.SlideOnRemove) {
        beginRefType |= MergeTree.ReferenceType.SlideOnRemove;
        endRefType |= MergeTree.ReferenceType.SlideOnRemove;
    }

    const startLref = createPositionReference(client, start, beginRefType);
    const endLref = createPositionReference(client, end, endRefType);
    if (startLref && endLref) {
        startLref.pairedRef = endLref;
        endLref.pairedRef = startLref;
        const rangeProp = {
            [MergeTree.reservedRangeLabelsKey]: [label],
        };
        startLref.addProperties(rangeProp);
        endLref.addProperties(rangeProp);

        const ival = new SequenceInterval(startLref, endLref, intervalType, rangeProp);
        return ival;
    }
}

export function defaultIntervalConflictResolver(a: Interval, b: Interval) {
    a.addPropertySet(b.properties);
    return a;
}

export function createIntervalIndex(conflict?: MergeTree.IntervalConflictResolver<Interval>) {
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
    private readonly intervalTree = new MergeTree.IntervalTree<TInterval>();
    private readonly endIntervalTree: MergeTree.RedBlackTree<TInterval, TInterval>;
    private conflictResolver: MergeTree.IntervalConflictResolver<TInterval>;
    private endConflictResolver: MergeTree.ConflictAction<TInterval, TInterval>;

    constructor(
        private readonly client: MergeTree.Client,
        private readonly label: string,
        private readonly helpers: IIntervalHelpers<TInterval>) {
        this.endIntervalTree =
            // eslint-disable-next-line @typescript-eslint/unbound-method
            new MergeTree.RedBlackTree<TInterval, TInterval>(helpers.compareEnds);
    }

    public addConflictResolver(conflictResolver: MergeTree.IntervalConflictResolver<TInterval>) {
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
            }
            else {
                this.intervalTree.mapBackward((interval: TInterval) => {
                    results.push(interval);
                });
            }
        }
        else {
            const transientInterval: TInterval = this.helpers.create(
                "transient",
                start,
                end,
                this.client,
                MergeTree.IntervalType.Transient,
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
                }
                else {
                    this.intervalTree.mapBackward((interval: TInterval) => {
                        if (transientInterval.compareEnd(interval) === 0) {
                            results.push(interval);
                        }
                    });
                }
            }
            else {
                // Start and (possibly) end provided. Walk the subtrees that may contain
                // this start position.
                const compareFn =
                    end === undefined ?
                        (node: MergeTree.IntervalNode<TInterval>) => {
                            return transientInterval.compareStart(node.key);
                        } :
                        (node: MergeTree.IntervalNode<TInterval>) => {
                            return transientInterval.compare(node.key);
                        };
                const continueLeftFn = (cmpResult: number) => cmpResult <= 0;
                const continueRightFn = (cmpResult: number) => cmpResult >= 0;
                const actionFn = (node: MergeTree.IntervalNode<TInterval>) => {
                    results.push(node.key);
                };

                if (iteratesForward) {
                    this.intervalTree.intervals.walkExactMatchesForward(
                        compareFn, actionFn, continueLeftFn, continueRightFn,
                    );
                }
                else {
                    this.intervalTree.intervals.walkExactMatchesBackward(
                        compareFn, actionFn, continueLeftFn, continueRightFn,
                    );
                }
            }
        }
    }

    public findOverlappingIntervals(startPosition: number, endPosition: number) {
        if (!this.intervalTree.intervals.isEmpty()) {
            const transientInterval =
                this.helpers.create(
                    "transient",
                    startPosition,
                    endPosition,
                    this.client,
                    MergeTree.IntervalType.Transient);

            const overlappingIntervalNodes = this.intervalTree.match(transientInterval);
            return overlappingIntervalNodes.map((node) => node.key);
        } else {
            return [];
        }
    }

    public previousInterval(pos: number) {
        const transientInterval = this.helpers.create(
            "transient", pos, pos, this.client, MergeTree.IntervalType.Transient);
        const rbNode = this.endIntervalTree.floor(transientInterval);
        if (rbNode) {
            return rbNode.data;
        }
    }

    public nextInterval(pos: number) {
        const transientInterval = this.helpers.create(
            "transient", pos, pos, this.client, MergeTree.IntervalType.Transient);
        const rbNode = this.endIntervalTree.ceil(transientInterval);
        if (rbNode) {
            return rbNode.data;
        }
    }

    public removeInterval(startPosition: number, endPosition: number) {
        const transientInterval = this.helpers.create(
            "transient", startPosition, endPosition, this.client, MergeTree.IntervalType.Transient);
        this.intervalTree.remove(transientInterval);
        this.endIntervalTree.remove(transientInterval);
        return transientInterval;
    }

    public removeExistingInterval(interval: TInterval) {
        this.intervalTree.removeExisting(interval);
        this.endIntervalTree.removeExisting(interval);
    }

    public createInterval(start: number, end: number, intervalType: MergeTree.IntervalType): TInterval {
        return this.helpers.create(this.label, start, end, this.client, intervalType);
    }

    // TODO: remove interval, handle duplicate intervals
    public addInterval(
        start: number,
        end: number,
        intervalType: MergeTree.IntervalType,
        props?: MergeTree.PropertySet) {
        const interval: TInterval = this.createInterval(start, end, intervalType);
        if (interval) {
            interval.addProperties(props);
            if (this.label && (this.label.length > 0)) {
                interval.properties[MergeTree.reservedRangeLabelsKey] = [this.label];
            }
            interval.properties[reservedIntervalIdKey] = uuid();
            this.intervalTree.put(interval, this.conflictResolver);
            this.endIntervalTree.put(interval, interval, this.endConflictResolver);
        }
        return interval;
    }

    public getIntervalById(id: string) {
        let result: TInterval | undefined;
        this.mapUntil((interval: TInterval) => {
            if (interval.properties && interval.properties[reservedIntervalIdKey].toString() === id) {
                result = interval;
                return false;
            }
            return true;
        });
        return result;
    }

    public serialize() {
        const client = this.client;
        const intervals = this.intervalTree.intervals.keys();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return intervals.map((interval) => interval.serialize(client));
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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

    private static readonly _ops: Map<string, IValueOperation<IntervalCollection<SequenceInterval>>> =
        new Map<string, IValueOperation<IntervalCollection<SequenceInterval>>>(
            [[
                "add",
                {
                    process: (value, params, local, op) => {
                        // Local ops were applied when the message was created
                        if (local) {
                            return;
                        }

                        value.addInternal(params, local, op);
                    },
                },
            ],
            [
                "delete",
                {
                    process: (value, params, local, op) => {
                        if (local) {
                            return;
                        }
                        value.deleteInterval(params, local, op);
                    },
                },
            ]]);
}

const compareIntervalEnds = (a: Interval, b: Interval) => a.end - b.end;

function createInterval(label: string, start: number, end: number, client: MergeTree.Client): Interval {
    let rangeProp: MergeTree.PropertySet;
    if (label && (label.length > 0)) {
        rangeProp = {
            [MergeTree.reservedRangeLabelsKey]: [label],
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
    private static readonly _ops: Map<string, IValueOperation<IntervalCollection<Interval>>> =
        new Map<string, IValueOperation<IntervalCollection<Interval>>>(
            [[
                "add",
                {
                    process: (value, params, local, op) => {
                        // Local ops were applied when the message was created
                        if (local) {
                            return;
                        }

                        value.addInternal(params, local, op);
                    },
                },
            ],
            [
                "delete",
                {
                    process: (value, params, local, op) => {
                        if (local) {
                            return;
                        }
                        value.deleteInterval(params, local, op);
                    },
                },
            ]]);
}

export type DeserializeCallback = (properties: MergeTree.PropertySet) => void;

export class IntervalCollectionView<TInterval extends ISerializableInterval> extends EventEmitter {
    private readonly localCollection: LocalIntervalCollection<TInterval>;
    private onDeserialize: DeserializeCallback;

    constructor(
        private readonly client: MergeTree.Client,
        savedSerializedIntervals: ISerializedInterval[],
        label: string,
        helpers: IIntervalHelpers<TInterval>,
        private readonly emitter: IValueOpEmitter) {
        super();

        // Instantiate the local interval collection based on the saved intervals
        this.localCollection = new LocalIntervalCollection<TInterval>(client, label, helpers);
        if (savedSerializedIntervals) {
            for (const serializedInterval of savedSerializedIntervals) {
                this.localCollection.addInterval(
                    serializedInterval.start,
                    serializedInterval.end,
                    serializedInterval.intervalType,
                    serializedInterval.properties);
            }
        }
    }

    public attachDeserializer(onDeserialize: DeserializeCallback): void {
        this.attachDeserializerCore(onDeserialize);
    }

    public addConflictResolver(conflictResolver: MergeTree.IntervalConflictResolver<TInterval>): void {
        this.localCollection.addConflictResolver(conflictResolver);
    }

    public findOverlappingIntervals(startPosition: number, endPosition: number): TInterval[] {
        return this.localCollection.findOverlappingIntervals(startPosition, endPosition);
    }

    public map(fn: (interval: TInterval) => void) {
        this.localCollection.map(fn);
    }

    public gatherIterationResults(
        results: TInterval[],
        iteratesForward: boolean,
        start?: number,
        end?: number) {
        this.localCollection.gatherIterationResults(results, iteratesForward, start, end);
    }

    public previousInterval(pos: number): TInterval {
        return this.localCollection.previousInterval(pos);
    }

    public nextInterval(pos: number): TInterval {
        return this.localCollection.nextInterval(pos);
    }

    public on(
        event: "addInterval" | "deleteInterval",
        listener: (interval: ISerializedInterval, local: boolean, op: ISequencedDocumentMessage) => void): this {
        return super.on(event, listener);
    }

    public add(
        start: number,
        end: number,
        intervalType: MergeTree.IntervalType,
        props?: MergeTree.PropertySet,
    ) {
        let seq = 0;
        if (this.client) {
            seq = this.client.getCurrentSeq();
        }

        const serializedInterval: ISerializedInterval = {
            end,
            intervalType,
            properties: props,
            sequenceNumber: seq,
            start,
        };

        return this.addInternal(serializedInterval, true, undefined);
    }

    public delete(
        start: number,
        end: number) {
        let sequenceNumber = 0;
        if (this.client) {
            sequenceNumber = this.client.getCurrentSeq();
        }

        const serializedInterval: ISerializedInterval = {
            start,
            end,
            sequenceNumber,
            intervalType: MergeTree.IntervalType.Transient,
        };

        this.deleteInterval(serializedInterval, true, undefined);
    }

    // TODO: error cases
    public addInternal(serializedInterval: ISerializedInterval, local: boolean, op: ISequencedDocumentMessage) {
        const interval = this.localCollection.addInterval(
            serializedInterval.start,
            serializedInterval.end,
            serializedInterval.intervalType,
            serializedInterval.properties);

        if (interval) {
            // Local ops get submitted to the server. Remote ops have the deserializer run.
            if (local) {
                this.emitter.emit("add", undefined, serializedInterval);
            } else {
                if (this.onDeserialize) {
                    this.onDeserialize(interval);
                }
            }
        }

        this.emit("addInterval", interval, local, op);

        return interval;
    }

    private deleteExistingInterval(interval: TInterval) {
        // The given interval is known to exist in the collection.
        this.localCollection.removeExistingInterval(interval);
        const serializedInterval: ISerializedInterval = interval.serialize(this.client);
        this.submitDelete(interval, serializedInterval, true, undefined);
    }

    public deleteInterval(serializedInterval: ISerializedInterval, local: boolean, op: ISequencedDocumentMessage) {
        // An interval with the given start and end is not known to exist in the collection.
        const interval = this.localCollection.removeInterval(serializedInterval.start, serializedInterval.end);
        this.submitDelete(interval, serializedInterval, local, op);
    }

    private submitDelete(
        interval: TInterval,
        serializedInterval: ISerializedInterval,
        local: boolean,
        op: ISequencedDocumentMessage) {
        if (interval) {
            // Local ops get submitted to the server. Remote ops have the deserializer run.
            if (local) {
                this.emitter.emit("delete", undefined, serializedInterval);
            } else {
                if (this.onDeserialize) {
                    this.onDeserialize(interval);
                }
            }
        }

        this.emit("deleteInterval", interval, local, op);
    }

    public getIntervalById(id: string) {
        return this.localCollection.getIntervalById(id);
    }

    public removeIntervalById(id: string) {
        const interval = this.localCollection.getIntervalById(id);
        if (interval) {
            this.deleteExistingInterval(interval);
        }
        return interval;
    }

    public serializeInternal() {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.localCollection.serialize();
    }

    private attachDeserializerCore(onDeserialize?: DeserializeCallback): void {
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
}

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

export class IntervalCollection<TInterval extends ISerializableInterval> {
    private savedSerializedIntervals?: ISerializedInterval[];
    private view: IntervalCollectionView<TInterval>;

    public get attached(): boolean {
        return !!this.view;
    }

    constructor(private readonly helpers: IIntervalHelpers<TInterval>, private readonly requiresClient: boolean,
        private readonly emitter: IValueOpEmitter,
        serializedIntervals: ISerializedInterval[]) {
        this.savedSerializedIntervals = serializedIntervals;
    }

    public attachGraph(client: MergeTree.Client, label: string) {
        if (this.view) {
            throw new Error("Only supports one Sequence attach");
        }

        if ((client === undefined) && (this.requiresClient)) {
            throw new Error("Client required for this collection");
        }

        this.view = new IntervalCollectionView<TInterval>(client,
            this.savedSerializedIntervals, label, this.helpers, this.emitter);
        this.savedSerializedIntervals = undefined;
    }

    public add(
        startPosition: number,
        endPosition: number,
        intervalType: MergeTree.IntervalType,
        props?: MergeTree.PropertySet,
    ) {
        if (!this.view) {
            throw new Error("attach must be called prior to adding intervals");
        }

        return this.view.add(startPosition, endPosition, intervalType, props);
    }

    public delete(
        startPosition: number,
        endPosition: number,
    ) {
        if (!this.view) {
            throw new Error("attach must be called prior to deleting intervals");
        }

        this.view.delete(startPosition, endPosition);
    }

    public addConflictResolver(conflictResolver: MergeTree.IntervalConflictResolver<TInterval>): void {
        this.view.addConflictResolver(conflictResolver);
    }

    public async getView(onDeserialize?: DeserializeCallback): Promise<IntervalCollectionView<TInterval>> {
        if (!this.view) {
            return Promise.reject(new Error("attachSequence must be called prior to retrieving the view"));
        }

        // Attach custom deserializers if specified
        if (onDeserialize) {
            this.view.attachDeserializer(onDeserialize);
        }

        return this.view;
    }

    public addInternal(
        serializedInterval: ISerializedInterval,
        local: boolean,
        op: ISequencedDocumentMessage) {
        if (!this.view) {
            throw new Error("attachSequence must be called");
        }

        return this.view.addInternal(serializedInterval, local, op);
    }

    public deleteInterval(
        serializedInterval: ISerializedInterval,
        local: boolean,
        op: ISequencedDocumentMessage): void {
        if (!this.view) {
            throw new Error("attach must be called prior to deleting intervals");
        }
        this.view.deleteInterval(serializedInterval, local, op);
    }

    public serializeInternal() {
        if (!this.view) {
            throw new Error("attachSequence must be called");
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.view.serializeInternal();
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
        if (!this.view) {
            return;
        }

        this.view.gatherIterationResults(results, iteratesForward, start, end);
    }

    public getIntervalById(id: string) {
        if (this.view) {
            return this.view.getIntervalById(id);
        }
    }

    public removeIntervalById(id: string) {
        if (this.view) {
            return this.view.removeIntervalById(id);
        }
    }
}

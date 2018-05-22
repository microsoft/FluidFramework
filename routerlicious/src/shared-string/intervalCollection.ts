import { EventEmitter } from "events";
import * as api from "../api-core";
import { IValueFactory, IValueOpEmitter, IValueOperation, IValueType } from "../data-types";
import * as MergeTree from "../merge-tree";
import { SharedString } from "./sharedString";

export interface ISerializedInterval {
    sequenceNumber: number;
    startPosition: number;
    endPosition: number;
    intervalType: MergeTree.IntervalType;
    properties?: MergeTree.PropertySet;
}

export class Interval implements MergeTree.IInterval {
    public properties: MergeTree.PropertySet;
    private checkMergeTree: MergeTree.MergeTree;

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
        const startPosition = this.start.toPosition(client.mergeTree,
            client.getCurrentSeq(), client.getClientId());
        const endPosition = this.end.toPosition(client.mergeTree,
            client.getCurrentSeq(), client.getClientId());
        const serializedInterval = {
            endPosition,
            intervalType: this.intervalType,
            sequenceNumber: client.getCurrentSeq(),
            startPosition,
        } as ISerializedInterval;
        if (this.properties) {
            serializedInterval.properties = this.properties;
        }
        return serializedInterval;
    }

    public clone() {
        return new Interval(this.start, this.end, this.intervalType);
    }

    public compare(b: Interval) {
        const startResult = this.start.compare(b.start);
        if (startResult === 0) {
            return (this.end.compare(b.end));
        } else {
            return startResult;
        }
    }

    public overlaps(b: Interval) {
        const result = (this.start.compare(b.end) < 0) &&
            (this.end.compare(b.start) >= 0);
        if (this.checkMergeTree) {
            this.checkOverlaps(b, result);
        }
        return result;
    }

    public union(b: Interval) {
        return new Interval(this.start.min(b.start),
            this.end.max(b.end), this.intervalType);
    }

    public addProperties(newProps: MergeTree.PropertySet, op?: MergeTree.ICombiningOp) {
        this.properties = MergeTree.addProperties(this.properties, newProps, op);
    }

    public overlapsPos(mergeTree: MergeTree.MergeTree, bstart: number, bend: number) {
        const startPos = this.start.toPosition(mergeTree, MergeTree.UniversalSequenceNumber,
            mergeTree.collabWindow.clientId);
        const endPos = this.start.toPosition(mergeTree, MergeTree.UniversalSequenceNumber,
            mergeTree.collabWindow.clientId);
        return (endPos > bstart) && (startPos < bend);
    }

    private checkOverlaps(b: Interval, result: boolean) {
        const astart = this.start.toPosition(this.checkMergeTree, this.checkMergeTree.collabWindow.currentSeq,
            this.checkMergeTree.collabWindow.clientId);
        const bstart = b.start.toPosition(this.checkMergeTree, this.checkMergeTree.collabWindow.currentSeq,
            this.checkMergeTree.collabWindow.clientId);
        const aend = this.end.toPosition(this.checkMergeTree, this.checkMergeTree.collabWindow.currentSeq,
            this.checkMergeTree.collabWindow.clientId);
        const bend = b.end.toPosition(this.checkMergeTree, this.checkMergeTree.collabWindow.currentSeq,
            this.checkMergeTree.collabWindow.clientId);
        const checkResult = ((astart < bend) && (bstart < aend));
        if (checkResult !== result) {
            // tslint:disable-next-line:max-line-length
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

export interface IIntervalCollection {
    findOverlappingIntervals(startPosition: number, endPosition: number): Interval[];
    addInterval(start: number, end: number, intervalType: MergeTree.IntervalType,
                props?: MergeTree.PropertySet): Interval;
}

export function createInterval(
    label: string, sharedString: SharedString, start: number,
    end: number, intervalType: MergeTree.IntervalType) {
    let beginRefType = MergeTree.ReferenceType.RangeBegin;
    let endRefType = MergeTree.ReferenceType.RangeEnd;
    if (intervalType === MergeTree.IntervalType.Nest) {
        beginRefType = MergeTree.ReferenceType.NestBegin;
        endRefType = MergeTree.ReferenceType.NestEnd;
    } else if (intervalType === MergeTree.IntervalType.Transient) {
        beginRefType = MergeTree.ReferenceType.Transient;
        endRefType = MergeTree.ReferenceType.Transient;
    }
    const startLref = sharedString.createPositionReference(start, beginRefType);
    const endLref = sharedString.createPositionReference(end, endRefType);
    if (startLref && endLref) {
        startLref.pairedRef = endLref;
        endLref.pairedRef = startLref;
        const rangeProp = {
            [MergeTree.reservedRangeLabelsKey]: [label],
        };
        startLref.addProperties(rangeProp);
        endLref.addProperties(rangeProp);

        const ival = new Interval(startLref, endLref, intervalType, rangeProp);
        // ival.checkMergeTree = sharedString.client.mergeTree;
        return ival;
    }
}

export function endIntervalComparer(a: Interval, b: Interval) {
    return a.end.compare(b.end);
}

export class LocalIntervalCollection implements IIntervalCollection {
    private intervalTree: MergeTree.IntervalTree<Interval> = new MergeTree.IntervalTree<Interval>();
    private endIntervalTree: MergeTree.RedBlackTree<Interval, Interval> =
        new MergeTree.RedBlackTree<Interval, Interval>(endIntervalComparer);

    constructor(public sharedString: SharedString, public label: string) {
    }

    public map(fn: (interval: Interval) => void) {
        this.intervalTree.map(fn);
    }
    public findOverlappingIntervals(startPosition: number, endPosition: number) {
        if (!this.intervalTree.intervals.isEmpty()) {
            const transientInterval = createInterval("transient", this.sharedString,
                startPosition, endPosition, MergeTree.IntervalType.Transient);
            const overlappingIntervalNodes = this.intervalTree.match(transientInterval);
            return overlappingIntervalNodes.map((node) => node.key);
        } else {
            return [];
        }
    }

    public previousInterval(pos: number) {
        const transientInterval = createInterval("transient", this.sharedString,
            pos, pos, MergeTree.IntervalType.Transient);
        const rbNode = this.endIntervalTree.floor(transientInterval);
        if (rbNode) {
            return rbNode.data;
        }
    }

    public nextInterval(pos: number) {
        const transientInterval = createInterval("transient", this.sharedString,
            pos, pos, MergeTree.IntervalType.Transient);
        const rbNode = this.endIntervalTree.ceil(transientInterval);
        if (rbNode) {
            return rbNode.data;
        }
    }

    public createInterval(start: number, end: number, intervalType: MergeTree.IntervalType) {
        return createInterval(this.label, this.sharedString, start, end, intervalType);
    }

    // TODO: remove interval, handle duplicate intervals
    public addInterval(
        start: number, end: number, intervalType: MergeTree.IntervalType,
        props?: MergeTree.PropertySet) {
        const interval = this.createInterval(start, end, intervalType);
        if (interval) {
            interval.addProperties(props);
            interval.properties[MergeTree.reservedRangeLabelsKey] = [this.label];
            this.intervalTree.put(interval);
            this.endIntervalTree.put(interval, interval);
        }
        return interval;
    }

    public serialize() {
        const client = this.sharedString.client;
        const intervals = this.intervalTree.intervals.keys();
        return intervals.map((interval) => interval.serialize(client));
    }
}

export class SharedIntervalCollectionFactory implements IValueFactory<SharedIntervalCollection> {
    public load(emitter: IValueOpEmitter, raw: ISerializedInterval[]): SharedIntervalCollection {
        return new SharedIntervalCollection(emitter, raw || []);
    }

    public store(value: SharedIntervalCollection): ISerializedInterval[] {
        return value.serialize();
    }
}

export class SharedIntervalCollectionValueType implements IValueType<SharedIntervalCollection> {
    public static Name = "sharedIntervalCollection";

    public get name(): string {
        return SharedIntervalCollectionValueType.Name;
    }

    public get factory(): IValueFactory<SharedIntervalCollection> {
        return this._factory;
    }

    public get ops(): Map<string, IValueOperation<SharedIntervalCollection>> {
        return this._ops;
    }

    // tslint:disable:variable-name
    private _factory: IValueFactory<SharedIntervalCollection>;
    private _ops: Map<string, IValueOperation<SharedIntervalCollection>>;
    // tslint:enable:variable-name

    constructor() {
        this._factory = new SharedIntervalCollectionFactory();
        this._ops = new Map<string, IValueOperation<SharedIntervalCollection>>(
            [[
                "add",
                {
                    prepare: async (value, params, local, op) => {
                        return;
                    },
                    process: (value, params, context, local, op) => {
                        // Local ops were applied when the message was created
                        if (local) {
                            return;
                        }

                        value.addSerialized(params, local, op);
                    },
                },
            ],
            [
                "remove",
                {
                    prepare: async (value, params, local, op) => {
                        return;
                    },
                    process: (value, params, context, local, op) => {
                        // Local ops were applied when the message was created
                        if (local) {
                            return;
                        }

                        value.remove(params, false);
                    },
                },
            ]]);
    }
}

export class SharedIntervalCollection extends EventEmitter {
    public localCollection: LocalIntervalCollection;
    public sharedString: SharedString;
    public label: string;
    public savedSerializedIntervals?: ISerializedInterval[];

    constructor(
        private emitter: IValueOpEmitter,
        serializedIntervals: ISerializedInterval[]) {
        super();
        this.savedSerializedIntervals = serializedIntervals;
    }

    public initialize(sharedString: SharedString, label: string) {
        if (!this.sharedString) {
            this.label = label;
            this.sharedString = sharedString;
            this.localCollection = new LocalIntervalCollection(sharedString, label);
            if (this.savedSerializedIntervals) {
                for (const serializedInterval of this.savedSerializedIntervals) {
                    this.deserializeInterval(serializedInterval);
                }
                this.savedSerializedIntervals = undefined;
            }
        }
    }

    public findOverlappingIntervals(startPosition: number, endPosition: number) {
        return this.localCollection.findOverlappingIntervals(startPosition, endPosition);
    }

    public serialize() {
        return this.localCollection.serialize();
    }

    public remove(serializedInterval: ISerializedInterval, submitEvent = true) {
        // TODO
    }

    public add(
        startPosition: number,
        endPosition: number,
        intervalType: MergeTree.IntervalType,
        props?: MergeTree.PropertySet) {

        const serializedInterval = {
            endPosition,
            intervalType,
            properties: props,
            sequenceNumber: this.sharedString.client.getCurrentSeq(),
            startPosition,
        } as ISerializedInterval;
        this.addSerialized(serializedInterval, true, null);
    }

    // TODO: error cases
    public addSerialized(serializedInterval: ISerializedInterval, local: boolean, op: api.ISequencedObjectMessage) {
        const interval = this.deserializeInterval(serializedInterval);
        if (interval) {
            // Null op means this was a local add and we should submit an op to the server
            if (op === null) {
                this.emitter.emit("add", serializedInterval);
            }
        }

        this.emit("addInterval", interval, local, op);

        return this;
    }

    public on(
        event: "addInterval",
        listener: (interval: ISerializedInterval, local: boolean, op: api.ISequencedObjectMessage) => void): this {
        return super.on(event, listener);
    }

    public onDeserialize = (value: Interval) => { return; };

    private deserializeInterval(serializedInterval: ISerializedInterval) {
        const interval = this.localCollection.addInterval(serializedInterval.startPosition,
            serializedInterval.endPosition, serializedInterval.intervalType,
            serializedInterval.properties);
        this.onDeserialize(interval);
        return interval;
    }
}

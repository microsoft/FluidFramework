// tslint:disable
import * as Collections from "./collections";
import { IValueFactory, IValueOpEmitter, IValueOperation, IValueType } from "../data-types";
import * as MergeTree from "./mergeTree";
import * as ops from "./ops";
import * as Properties from "./properties";
import * as SharedString from "./sharedString";

export interface ISerializedInterval {
    sequenceNumber: number;
    startPosition: number;
    endPosition: number;
    intervalType: ops.IntervalType;
    properties?: Properties.PropertySet;
}

export class Interval implements Collections.IInterval {
    properties: Properties.PropertySet;
    checkMergeTree: MergeTree.MergeTree;

    constructor(public start: MergeTree.LocalReference,
        public end: MergeTree.LocalReference,
        public intervalType: ops.IntervalType,
        props?: Properties.PropertySet) {
        if (props) {
            this.addProperties(props);
        }
    }

    public serialize(client: MergeTree.Client) {
        let startPosition = this.start.toPosition(client.mergeTree,
            client.getCurrentSeq(), client.getClientId());
        let endPosition = this.end.toPosition(client.mergeTree,
            client.getCurrentSeq(), client.getClientId());
        let serializedInterval = <ISerializedInterval>{
            endPosition,
            intervalType: this.intervalType,
            sequenceNumber: client.getCurrentSeq(),
            startPosition,
        };
        if (this.properties) {
            serializedInterval.properties = this.properties;
        }
        return serializedInterval;
    }

    addProperties(newProps: Properties.PropertySet, op?: ops.ICombiningOp) {
        this.properties = Properties.addProperties(this.properties, newProps, op);
    }

    clone() {
        return new Interval(this.start, this.end, this.intervalType);
    }

    compare(b: Interval) {
        let startResult = this.start.compare(b.start);
        if (startResult === 0) {
            return (this.end.compare(b.end));
        } else {
            return startResult;
        }
    }

    checkOverlaps(b: Interval, result: boolean) {
        let astart = this.start.toPosition(this.checkMergeTree, this.checkMergeTree.collabWindow.currentSeq,
            this.checkMergeTree.collabWindow.clientId);
        let bstart = b.start.toPosition(this.checkMergeTree, this.checkMergeTree.collabWindow.currentSeq,
            this.checkMergeTree.collabWindow.clientId);
        let aend = this.end.toPosition(this.checkMergeTree, this.checkMergeTree.collabWindow.currentSeq,
            this.checkMergeTree.collabWindow.clientId);
        let bend = b.end.toPosition(this.checkMergeTree, this.checkMergeTree.collabWindow.currentSeq,
            this.checkMergeTree.collabWindow.clientId);
        let checkResult = ((astart<bend)&&(bstart<aend));
        if (checkResult !== result) {
            console.log(`check mismatch: res ${result} ${this.start.segment===b.end.segment} ${b.start.segment===this.end.segment}`);
            console.log(`as ${astart} ae ${aend} bs ${bstart} be ${bend}`);
            console.log(`as ${MergeTree.ordinalToArray(this.start.segment.ordinal)}@${this.start.offset}`);
            console.log(`ae ${MergeTree.ordinalToArray(this.end.segment.ordinal)}@${this.end.offset}`);
            console.log(`bs ${MergeTree.ordinalToArray(b.start.segment.ordinal)}@${b.start.offset}`);
            console.log(`be ${MergeTree.ordinalToArray(b.end.segment.ordinal)}@${b.end.offset}`);
            console.log(this.checkMergeTree.nodeToString(b.start.segment.parent,""));
        }

    }

    overlaps(b: Interval) {
        let result = (this.start.compare(b.end) < 0) &&
            (this.end.compare(b.start) > 0);
        if (this.checkMergeTree) {
            this.checkOverlaps(b, result);
        }
        return result;
    }

    union(b: Interval) {
        return new Interval(this.start.min(b.start),
            this.end.max(b.end), this.intervalType);
    }
}

export interface IIntervalCollection {
    findOverlappingIntervals(startPosition: number, endPosition: number): Interval[];
    addInterval(start: number, end: number, intervalType: ops.IntervalType,
        props?: Properties.PropertySet): Interval;
}

export function createInterval(label: string, sharedString: SharedString.SharedString, start: number,
    end: number, intervalType: ops.IntervalType) {
    let beginRefType = ops.ReferenceType.RangeBegin;
    let endRefType = ops.ReferenceType.RangeEnd;
    if (intervalType === ops.IntervalType.Nest) {
        beginRefType = ops.ReferenceType.NestBegin;
        endRefType = ops.ReferenceType.NestEnd;
    }
    let startLref = sharedString.createPositionReference(start, beginRefType);
    let endLref = sharedString.createPositionReference(end, endRefType);
    if (startLref && endLref) {
        startLref.pairedRef = endLref;
        endLref.pairedRef = startLref;
        let rangeProp = {
            [MergeTree.reservedRangeLabelsKey]: [label],
        };
        startLref.addProperties(rangeProp);
        endLref.addProperties(rangeProp);
        let ival = new Interval(startLref, endLref, intervalType, rangeProp);
        // ival.checkMergeTree = sharedString.client.mergeTree;
        return ival;
    }
}

export class LocalIntervalCollection implements IIntervalCollection {
    intervalTree = new Collections.IntervalTree<Interval>();

    constructor(public sharedString: SharedString.SharedString, public label: string) {
    }

    public findOverlappingIntervals(startPosition: number, endPosition: number) {
        let transientInterval = createInterval("transient", this.sharedString,
            startPosition, endPosition, ops.IntervalType.Simple);
        let overlappingIntervalNodes = this.intervalTree.match(transientInterval);
        return overlappingIntervalNodes.map((node) => node.key);
    }

    public createInterval(start: number, end: number, intervalType: ops.IntervalType) {
        return createInterval(this.label, this.sharedString, start, end, intervalType);
    }

    // TODO: remove interval, handle duplicate intervals
    addInterval(start: number, end: number, intervalType: ops.IntervalType,
        props?: Properties.PropertySet) {
        let interval = this.createInterval(start, end, intervalType);
        if (interval) {
            interval.addProperties(props);
            interval.properties[MergeTree.reservedRangeLabelsKey] = [this.label];
            this.intervalTree.put(interval);
        }
        return interval;
    }

    serialize() {
        let client = this.sharedString.client;
        let intervals = this.intervalTree.intervals.keys();
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
                    prepare: async (old, params) => {
                        return;
                    },
                    process: (old, params, context) => {
                        old.addSerialized(params, false);
                        return old;
                    },
                },
            ],
            [
                "remove",
                {
                    prepare: async (old, params) => {
                        return;
                    },
                    process: (old, params, context) => {
                        old.remove(params, false);
                        return old;
                    },
                },
            ]]);
    }
}

export class SharedIntervalCollection {
    public localCollection: LocalIntervalCollection;
    public sharedString: SharedString.SharedString;
    public label: string;
    public savedSerializedIntervals?: ISerializedInterval[];
    public onAdd = (value: Interval) => { return; };

    constructor(private emitter: IValueOpEmitter,
        serializedIntervals: ISerializedInterval[]) {
        this.savedSerializedIntervals = serializedIntervals;
    }

    initialize(sharedString: SharedString.SharedString, label: string) {
        if (!this.sharedString) {
            this.label = label;
            this.sharedString = sharedString;
            this.localCollection = new LocalIntervalCollection(sharedString, label);
            if (this.savedSerializedIntervals) {
                for (let serializedInterval of this.savedSerializedIntervals) {
                    this.deserializeInterval(serializedInterval);
                }
                this.savedSerializedIntervals = undefined;
            }
        }
    }

    findOverlappingIntervals(startPosition: number, endPosition: number) {
        return this.localCollection.findOverlappingIntervals(startPosition, endPosition);
    }

    deserializeInterval(serializedInterval: ISerializedInterval) {
        return this.localCollection.addInterval(serializedInterval.startPosition,
            serializedInterval.endPosition, serializedInterval.intervalType,
            serializedInterval.properties);
    }

    serialize() {
        return this.localCollection.serialize();
    }

    remove(serializedInterval: ISerializedInterval, submitEvent = true) {
        // TODO
    }

    add(startPosition: number, endPosition: number, intervalType: ops.IntervalType,
        props?: Properties.PropertySet) {
        let serializedInterval = <ISerializedInterval>{
            endPosition,
            intervalType,
            properties: props,
            sequenceNumber: this.sharedString.client.getCurrentSeq(),
            startPosition,
        };
        this.addSerialized(serializedInterval);
    }

    // TODO: error cases
    addSerialized(serializedInterval: ISerializedInterval, submitEvent = true) {
        let interval = this.deserializeInterval(serializedInterval);
        if (interval) {
            if (submitEvent) {
                this.emitter.emit("add", serializedInterval);
            }
            this.onAdd(interval);
        }
        return this;
    }
}


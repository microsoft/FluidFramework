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
        let endPosition = this.start.toPosition(client.mergeTree,
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

    overlaps(b: Interval) {
        return (this.start.compare(b.end) < 0) &&
            (this.end.compare(b.start) > 0);
    }

    union(b: Interval) {
        return new Interval(this.start.min(b.start),
            this.end.max(b.end), this.intervalType);
    }
}

export interface IIntervalCollection {
    findOverlappingIntervals(interval: Interval): Interval[];
    addInterval(start: number, end: number, intervalType: ops.IntervalType,
        props?: Properties.PropertySet): Interval;
}

export class LocalIntervalCollection {
    intervalTree = new Collections.IntervalTree<Interval>();

    constructor(public sharedString: SharedString.SharedString, public label: string) {
    }

    public createInterval(start: number, end: number, intervalType: ops.IntervalType) {
        let beginRefType = ops.ReferenceType.RangeBegin;
        let endRefType = ops.ReferenceType.RangeEnd;
        if (intervalType === ops.IntervalType.Nest) {
            beginRefType = ops.ReferenceType.NestBegin;
            endRefType = ops.ReferenceType.NestEnd;
        }
        let startLref = this.sharedString.createPositionReference(start, beginRefType);
        let endLref = this.sharedString.createPositionReference(start, endRefType);
        if (startLref && endLref) {
            startLref.pairedRef = endLref;
            endLref.pairedRef = startLref;
            let rangeProp = {
                [MergeTree.reservedRangeLabelsKey]: [this.label],
            };
            startLref.addProperties(rangeProp);
            endLref.addProperties(rangeProp);
            return new Interval(startLref, endLref, intervalType, rangeProp);
        }
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

// TODO: fix race condition on creation by putting type on every operation
export function getSharedIntervalCollection(sharedString: SharedString.SharedString, label: string) {
    if (!sharedString.intervalCollections.has(label)) {
        sharedString.intervalCollections.set<SharedIntervalCollection>(label, undefined,
            SharedIntervalCollectionValueType.Name);
    }
    let sharedCollection = sharedString.intervalCollections.get<SharedIntervalCollection>(label);
    sharedCollection.initialize(sharedString, label);
    return sharedCollection;
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
            if (this.savedSerializedIntervals) {
                for (let serializedInterval of this.savedSerializedIntervals) {
                    this.deserializeInterval(serializedInterval);
                }
                this.savedSerializedIntervals = undefined;
            }
        }
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


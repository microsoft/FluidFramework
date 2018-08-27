import { IValueFactory, IValueOpEmitter, IValueOperation, IValueType } from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import { ISequencedObjectMessage } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
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

interface IIntervalCollection {
    findOverlappingIntervals(startPosition: number, endPosition: number): Interval[];
    addInterval(start: number, end: number, intervalType: MergeTree.IntervalType,
                props?: MergeTree.PropertySet): Interval;
}

function endIntervalComparer(a: Interval, b: Interval) {
    return a.end.compare(b.end);
}

class LocalIntervalCollection implements IIntervalCollection {
    private intervalTree = new MergeTree.IntervalTree<Interval>();
    private endIntervalTree = new MergeTree.RedBlackTree<Interval, Interval>(endIntervalComparer);

    constructor(private sharedString: SharedString, private label: string) {
    }

    public map(fn: (interval: Interval) => void) {
        this.intervalTree.map(fn);
    }

    public findOverlappingIntervals(startPosition: number, endPosition: number) {
        if (!this.intervalTree.intervals.isEmpty()) {
            const transientInterval = this.createIntervalCore(
                "transient", startPosition, endPosition, MergeTree.IntervalType.Transient);
            const overlappingIntervalNodes = this.intervalTree.match(transientInterval);
            return overlappingIntervalNodes.map((node) => node.key);
        } else {
            return [];
        }
    }

    public previousInterval(pos: number) {
        const transientInterval = this.createIntervalCore(
            "transient", pos, pos, MergeTree.IntervalType.Transient);
        const rbNode = this.endIntervalTree.floor(transientInterval);
        if (rbNode) {
            return rbNode.data;
        }
    }

    public nextInterval(pos: number) {
        const transientInterval = this.createIntervalCore(
            "transient", pos, pos, MergeTree.IntervalType.Transient);
        const rbNode = this.endIntervalTree.ceil(transientInterval);
        if (rbNode) {
            return rbNode.data;
        }
    }

    public createInterval(start: number, end: number, intervalType: MergeTree.IntervalType) {
        return this.createIntervalCore(this.label, start, end, intervalType);
    }

    // TODO: remove interval, handle duplicate intervals
    public addInterval(
        start: number,
        end: number,
        intervalType: MergeTree.IntervalType,
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

    private createIntervalCore(
        label: string,
        start: number,
        end: number,
        intervalType: MergeTree.IntervalType): Interval {

        let beginRefType = MergeTree.ReferenceType.RangeBegin;
        let endRefType = MergeTree.ReferenceType.RangeEnd;
        if (intervalType === MergeTree.IntervalType.Nest) {
            beginRefType = MergeTree.ReferenceType.NestBegin;
            endRefType = MergeTree.ReferenceType.NestEnd;
        } else if (intervalType === MergeTree.IntervalType.Transient) {
            beginRefType = MergeTree.ReferenceType.Transient;
            endRefType = MergeTree.ReferenceType.Transient;
        }
        const startLref = this.sharedString.createPositionReference(start, beginRefType);
        const endLref = this.sharedString.createPositionReference(end, endRefType);
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
        } else {
            return null;
        }
    }
}

class SharedIntervalCollectionFactory implements IValueFactory<SharedIntervalCollection> {
    public load(emitter: IValueOpEmitter, raw: ISerializedInterval[]): SharedIntervalCollection {
        return new SharedIntervalCollection(emitter, raw || []);
    }

    public store(value: SharedIntervalCollection): ISerializedInterval[] {
        return value.serializeInternal();
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
                    prepare: (value, params, local, op) => {
                        // Local ops were applied when the message was created
                        if (local) {
                            return;
                        }

                        return value.prepareAddInternal(params, local, op);
                    },
                    process: (value, params, context, local, op) => {
                        // Local ops were applied when the message was created
                        if (local) {
                            return;
                        }

                        value.addInternal(params, context, local, op);
                    },
                },
            ]]);
    }
}

export type PrepareDeserializeCallback = (properties: MergeTree.PropertySet) => Promise<any>;
export type DeserializeCallback = (value: Interval, context: any) => void;

export class SharedIntervalCollectionView extends EventEmitter {
    private localCollection: LocalIntervalCollection;
    private onPrepareDeserialize: PrepareDeserializeCallback;
    private onDeserialize: DeserializeCallback;
    private attachingP = Promise.resolve();

    constructor(
        public sharedString: SharedString,
        savedSerializedIntervals: ISerializedInterval[],
        label: string,
        private emitter: IValueOpEmitter) {
        super();

        // Instantiate the local interval collection based on the saved intervals
        this.localCollection = new LocalIntervalCollection(sharedString, label);
        if (savedSerializedIntervals) {
            for (const serializedInterval of savedSerializedIntervals) {
                this.localCollection.addInterval(
                    serializedInterval.startPosition,
                    serializedInterval.endPosition,
                    serializedInterval.intervalType,
                    serializedInterval.properties);
            }
        }
    }

    public async attachDeserializer(
        onDeserialize: DeserializeCallback,
        onPrepareDeserialize: PrepareDeserializeCallback): Promise<void> {

        this.attachingP = this.attachDeserializerCore(onDeserialize, onPrepareDeserialize);
        return this.attachingP;
    }

    public findOverlappingIntervals(startPosition: number, endPosition: number): Interval[] {
        return this.localCollection.findOverlappingIntervals(startPosition, endPosition);
    }

    public map(fn: (interval: Interval) => void) {
        this.localCollection.map(fn);
    }

    public previousInterval(pos: number): Interval {
        return this.localCollection.previousInterval(pos);
    }

    public nextInterval(pos: number): Interval {
        return this.localCollection.nextInterval(pos);
    }

    public on(
        event: "addInterval",
        listener: (interval: ISerializedInterval, local: boolean, op: ISequencedObjectMessage) => void): this {
        return super.on(event, listener);
    }

    public add(
        startPosition: number,
        endPosition: number,
        intervalType: MergeTree.IntervalType,
        props?: MergeTree.PropertySet) {

        const serializedInterval: ISerializedInterval = {
            endPosition,
            intervalType,
            properties: props,
            sequenceNumber: this.sharedString.client.getCurrentSeq(),
            startPosition,
        };

        this.addInternal(serializedInterval, null, true, null);
    }

    // TODO: error cases
    public addInternal(
        serializedInterval: ISerializedInterval,
        context: any,
        local: boolean,
        op: ISequencedObjectMessage) {

        const interval = this.localCollection.addInterval(
            serializedInterval.startPosition,
            serializedInterval.endPosition,
            serializedInterval.intervalType,
            serializedInterval.properties);

        if (interval) {
            // Local ops get submitted to the server. Remote ops have the deserializer run.
            if (local) {
                this.emitter.emit("add", serializedInterval);
            } else {
                if (this.onDeserialize) {
                    this.onDeserialize(interval, context);
                }
            }
        }

        this.emit("addInterval", interval, local, op);

        return this;
    }

    public async prepareAdd(
        interval: ISerializedInterval,
        local: boolean,
        message: ISequencedObjectMessage): Promise<any> {

        await this.attachingP;
        return this.onPrepareDeserialize ? this.onPrepareDeserialize(interval.properties) : null;
    }

    public serializeInternal() {
        return this.localCollection.serialize();
    }

    private async attachDeserializerCore(
        onDeserialize?: DeserializeCallback,
        onPrepareDeserialize?: PrepareDeserializeCallback): Promise<void> {

        // If no deserializer is specified can skip all processing work
        if (!onDeserialize && !onPrepareDeserialize) {
            return;
        }

        // Start by storing the callbacks so that any subsequent modifications make use of them
        this.onDeserialize = onDeserialize;
        this.onPrepareDeserialize = onPrepareDeserialize;

        // Trigger the async prepare work across all values in the collection
        const preparedIntervalsP: Array<Promise<{ context: any, interval: Interval }>> = [];
        this.localCollection.map((interval) => {
            const preparedIntervalP = onPrepareDeserialize(interval.properties).then(
                (context) => ({ context, interval }));
            preparedIntervalsP.push(preparedIntervalP);
        });

        const preparedIntervals = await Promise.all(preparedIntervalsP);
        for (const preparedInterval of preparedIntervals) {
            this.onDeserialize(preparedInterval.interval, preparedInterval.context);
        }
    }
}

export class SharedIntervalCollection {
    private savedSerializedIntervals?: ISerializedInterval[];
    private view: SharedIntervalCollectionView;

    public get attached(): boolean {
        return !!this.view;
    }

    constructor(private emitter: IValueOpEmitter, serializedIntervals: ISerializedInterval[]) {
        this.savedSerializedIntervals = serializedIntervals;
    }

    public attachSharedString(sharedString: SharedString, label: string) {
        if (this.view) {
            throw new Error("Only supports one SharedString attach");
        }

        this.view = new SharedIntervalCollectionView(sharedString, this.savedSerializedIntervals, label, this.emitter);
        this.savedSerializedIntervals = undefined;
    }

    public add(
        startPosition: number,
        endPosition: number,
        intervalType: MergeTree.IntervalType,
        props?: MergeTree.PropertySet) {

        if (!this.view) {
            return Promise.reject("attachSharedString must be called prior to adding intervals");
        }

        this.view.add(startPosition, endPosition, intervalType, props);
    }

    public async getView(
        onDeserialize?: DeserializeCallback,
        onPrepareDeserialize?: PrepareDeserializeCallback): Promise<SharedIntervalCollectionView> {

        if (!this.view) {
            return Promise.reject("attachSharedString must be called prior to retrieving the view");
        }

        // Attach custom deserializers if specified
        if (onDeserialize || onPrepareDeserialize) {
            await this.view.attachDeserializer(onDeserialize, onPrepareDeserialize);
        }

        return this.view;
    }

    public prepareAddInternal(
        interval: ISerializedInterval,
        local: boolean,
        message: ISequencedObjectMessage): Promise<any> {

        if (!this.view) {
            return Promise.reject("attachSharedString must be called");
        }

        return this.view.prepareAdd(interval, local, message);
    }

    public addInternal(
        serializedInterval: ISerializedInterval,
        context: any,
        local: boolean,
        op: ISequencedObjectMessage) {

        if (!this.view) {
            throw new Error("attachSharedString must be called");
        }

        return this.view.addInternal(serializedInterval, context, local, op);
    }

    public serializeInternal() {
        if (!this.view) {
            throw new Error("attachSharedString must be called");
        }

        return this.view.serializeInternal();
    }
}

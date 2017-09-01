import { EventEmitter } from "events";
import * as resources from "gitresources";
import * as _ from "lodash";
import * as api from "../api";
import { Counter } from "./counter";

/**
 * Description of a map delta operation
 */
interface IMapOperation {
    type: string;
    key?: string;
    value?: IMapValue;
}

export enum ValueType {
    // The value is a collaborative object
    Collaborative,

    // The value is a plain JavaScript object
    Plain,

    // The value is a counter
    Counter,
}

export interface ICollaborativeMapValue {
    // The type of collaborative object
    type: string;

    // The id for the collaborative object
    id: string;
}

export interface IMapValue {
    // The type of the value
    type: string;

    // The actual value
    value: any;
}

const snapshotFileName = "header";

export class MapView implements api.IMapView {
    constructor(
        private document: api.Document,
        id: string,
        private data: {[key: string]: IMapValue },
        private events: EventEmitter,
        private submitLocalOperation: (op) => void) {
    }

    public get(key: string) {
        if (!(key in this.data)) {
            return undefined;
        }

        const value = this.data[key];
        if (value.type === ValueType[ValueType.Collaborative]) {
            const collabMapValue = value.value as ICollaborativeMapValue;
            return this.document.get(collabMapValue.id);
        } else {
            return this.data[key].value;
        }
    }

    public has(key: string): boolean {
        return key in this.data;
    }

    public set(key: string, value: any): void {
        let operationValue: IMapValue;
        if (_.hasIn(value, "__collaborativeObject__")) {
            // Convert any local collaborative objects to our internal storage format
            const collaborativeObject = value as api.ICollaborativeObject;
            const collabMapValue: ICollaborativeMapValue = {
                id: collaborativeObject.id,
                type: collaborativeObject.type,
            };

            operationValue = {
                type: ValueType[ValueType.Collaborative],
                value: collabMapValue,
            };
        } else {
            operationValue = {
                type: ValueType[ValueType.Plain],
                value,
            };
        }

        const op: IMapOperation = {
            key,
            type: "set",
            value: operationValue,
        };

        this.setCore(op.key, op.value);
        this.submitLocalOperation(op);
    }

    public delete(key: string): void {
        const op: IMapOperation = {
            key,
            type: "delete",
        };

        this.deleteCore(op.key);
        this.submitLocalOperation(op);
    }

    public keys(): string[] {
        return _.keys(this.data);
    }

    public clear(): void {
        const op: IMapOperation = {
            type: "clear",
        };

        this.clearCore();
        this.submitLocalOperation(op);
    }

    public getData(): {[key: string]: IMapValue } {
        return _.clone(this.data);
    }

    public setCore(key: string, value: IMapValue) {
        this.data[key] = value;
        this.events.emit("valueChanged", { key });
    }

    public clearCore() {
        this.data = {};
        this.events.emit("clear");
    }

    public deleteCore(key: string) {
        delete this.data[key];
        this.events.emit("valueChanged", { key });
    }

    public createCounter(key: string, value: number, min: number, max: number) {
        this.initCounter(key, value);
        return new Counter(this, key, min, max);
    }

    public initCounterCore(key: string, value: IMapValue) {
        if (value.type !== ValueType[ValueType.Counter]) {
            throw new Error("Invalid initial value type!");
        }
        if (typeof value.value !== "number") {
            throw new Error("Initial value should be a number");
        }
        this.data[key] = value;
        this.events.emit("valueChanged", { key });
    }

    public incrementCounter(key: string, value: number) {
        const operationValue: IMapValue = {type: ValueType[ValueType.Counter], value};
        const op: IMapOperation = {
            key,
            type: "incrementCounter",
            value: operationValue,
        };
        this.incrementCounterCore(op.key, op.value);
        this.submitLocalOperation(op);
    }

    public incrementCounterCore(key: string, value: IMapValue) {
        if (value.type !== ValueType[ValueType.Counter]) {
            throw new Error("Increment can only be performed on Counter type!");
        }
        if (typeof value.value !== "number") {
            throw new Error("Incremental amount should be a number");
        }
        if (!(key in this.data) || (typeof this.data[key].value !== "number")) {
            throw new Error("Invalid key!");
        }
        this.data[key].value += value.value;
        this.events.emit("valueChanged", { key });
    }

    private initCounter(key: string, value: number) {
        const operationValue: IMapValue = {type: ValueType[ValueType.Counter], value};
        const op: IMapOperation = {
            key,
            type: "initCounter",
            value: operationValue,
        };
        this.initCounterCore(op.key, op.value);
        this.submitLocalOperation(op);
    }
}

/**
 * Implementation of a map collaborative object
 */
class Map extends api.CollaborativeObject implements api.IMap {
    private view: MapView;

    /**
     * Constructs a new collaborative map. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(
        document: api.Document,
        id: string,
        sequenceNumber: number,
        services?: api.IDistributedObjectServices,
        version?: resources.ICommit,
        header?: string) {
        super(document, id, MapExtension.Type, sequenceNumber, services);

        const data = header ? JSON.parse(Buffer.from(header, "base64").toString("utf-8")) : {};
        this.view = new MapView(document, id, data, this.events, (op) => this.submitLocalOperation(op));
    }

    public async keys(): Promise<string[]> {
        return Promise.resolve(this.view.keys());
    }

    /**
     * Retrieves the value with the given key from the map.
     */
    public get(key: string) {
        return Promise.resolve(this.view.get(key));
    }

    public has(key: string): Promise<boolean> {
        return Promise.resolve(this.view.has(key));
    }

    public set(key: string, value: any): Promise<void> {
        return Promise.resolve(this.view.set(key, value));
    }

    public delete(key: string): Promise<void> {
        return Promise.resolve(this.view.delete(key));
    }

    public clear(): Promise<void> {
        return Promise.resolve(this.view.clear());
    }

    public createCounter(key: string, value?: number, min?: number, max?: number): Promise<api.ICounter> {
        if (value === undefined) {
            value = 0;
        }
        if (min === undefined) {
            min = Number.MIN_SAFE_INTEGER;
        }
        if (max === undefined) {
            max = Number.MAX_SAFE_INTEGER;
        }
        if (value < min || value > max) {
            throw new Error("Initial value exceeds the counter range!");
        }
        return Promise.resolve(this.view.createCounter(key, value, min, max));
    }

    public snapshot(): api.ITree {
        const tree: api.ITree = {
            entries: [
                {
                    path: snapshotFileName,
                    type: api.TreeEntry[api.TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(this.view.getData()),
                        encoding: "utf-8",
                    },
                },
            ],
        };

        return tree;
    }

    /**
     * Returns a synchronous view of the map
     */
    public getView(): Promise<api.IMapView> {
        return Promise.resolve(this.view);
    }

    protected submitCore(message: api.IObjectMessage) {
        // TODO chain these requests given the attach is async
        const op = message.contents as IMapOperation;

        // We need to translate any local collaborative object sets to the serialized form
        if (op.type === "set" && op.value.type === ValueType[ValueType.Collaborative]) {
            // We need to attach the object prior to submitting the message so that its state is available
            // to upstream users following the attach
            const collabMapValue = op.value.value as ICollaborativeMapValue;
            const collabObject = this.document.get(collabMapValue.id);
            collabObject.attach();
        }
    }

    protected processMinSequenceNumberChanged(value: number) {
        // TODO need our own concept of the zamboni here
    }

    protected processCore(message: api.ISequencedObjectMessage) {
        if (message.type === api.OperationType && message.clientId !== this.document.clientId) {
            const op: IMapOperation = message.contents;

            switch (op.type) {
                case "clear":
                    this.view.clearCore();
                    break;
                case "delete":
                    this.view.deleteCore(op.key);
                    break;
                case "set":
                    this.view.setCore(op.key, op.value);
                    break;
                case "initCounter":
                    this.view.initCounterCore(op.key, op.value);
                    break;
                case "incrementCounter":
                    this.view.incrementCounterCore(op.key, op.value);
                    break;
                default:
                    throw new Error("Unknown operation");
            }
        }

        this.events.emit("op", message);
    }
}

/**
 * The extension that defines the map
 */
export class MapExtension implements api.IExtension {
    public static Type = "https://graph.microsoft.com/types/map";

    public type: string = MapExtension.Type;

    public load(
        document: api.Document,
        id: string,
        sequenceNumber: number,
        services: api.IDistributedObjectServices,
        version: resources.ICommit,
        header: string): api.IMap {

        return new Map(document, id, sequenceNumber, services, version, header);
    }

    public create(document: api.Document, id: string): api.IMap {
        return new Map(document, id, 0);
    }
}

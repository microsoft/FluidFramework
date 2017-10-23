import { EventEmitter } from "events";
import * as resources from "gitresources";
import * as _ from "lodash";
import * as api from "../api-core";
import { getOrDefault } from "../core-utils";
import { Counter } from "./counter";
import { ICounter, IMap, IMapView, ISet } from "./interfaces";
import { DistributedSet } from "./set";

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

    // The value is a set
    Set,
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

interface IMapDataCompatibility {

    data: IMapValue;

    reject: Promise<any>;
}

const snapshotFileName = "header";

/**
 * Copies all values from the provided MapView to the given Map
 */
export function copyMap(from: IMapView, to: Map<string, any>) {
    from.forEach((value, key) => {
        to.set(key, value);
    });
}

export class MapView implements IMapView {
    private data = new Map<string, IMapValue>();

    constructor(
        private document: api.IDocument,
        id: string,
        data: {[key: string]: IMapValue },
        private events: EventEmitter,
        private submitLocalOperation: (op) => void) {

        // Initialize the map of values
        // tslint:disable-next-line:forin
        for (const key in data) {
            this.data.set(key, data[key]);
        }
    }

    public forEach(callbackFn: (value, key) => void) {
        this.data.forEach((value, key) => {
            callbackFn(this.translateValue(value), key);
        });
    }

    public get(key: string) {
        if (!this.data.has(key)) {
            return undefined;
        }

        const value = this.data.get(key);
        return this.translateValue(value);
    }

    public async wait<T>(key: string): Promise<T> {
        // Return immediately if the value already exists
        if (this.has(key)) {
            return this.get(key);
        }

        // Otherwise subscribe to changes
        return new Promise<T>((resolve, reject) => {
            const callback = (value: { key: string }) => {
                if (key === value.key) {
                    resolve(this.get(value.key));
                    this.events.removeListener("valueChanged", callback);
                }
            };

            this.events.on("valueChanged", callback);
        });
    }

    public has(key: string): boolean {
        return this.data.has(key);
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

    public keys(): IterableIterator<string> {
        return this.data.keys();
    }

    public clear(): void {
        const op: IMapOperation = {
            type: "clear",
        };

        this.clearCore();
        this.submitLocalOperation(op);
    }

    /**
     * Serializes the collaborative map to a JSON string
     */
    public serialize(): string {
        const serialized: any = {};
        this.data.forEach((value, key) => {
            serialized[key] = value;
        });
        return JSON.stringify(serialized);
    }

    public getMapValue(key: string): IMapValue {
        if (!this.data.has(key)) {
            return undefined;
        }

        return this.data.get(key);
    }

    public setCore(key: string, value: IMapValue) {
        this.data.set(key, value);
        this.events.emit("valueChanged", { key });
    }

    public clearCore() {
        this.data.clear();
        this.events.emit("clear");
    }

    public deleteCore(key: string) {
        this.data.delete(key);
        this.events.emit("valueChanged", { key });
    }

    public initCounter(key: string, value: number) {
        const operationValue: IMapValue = {type: ValueType[ValueType.Counter], value};
        const op: IMapOperation = {
            key,
            type: "initCounter",
            value: operationValue,
        };
        this.initCounterCore(op.key, op.value);
        this.submitLocalOperation(op);
    }

    public initCounterCore(key: string, value: IMapValue) {
        this.data.set(key, value);
        this.events.emit("valueChanged", { key });
    }

    public incrementCounter(key: string, value: number, min: number, max: number) {
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
        this.data.get(key).value += value.value;
        this.events.emit("valueChanged", { key });
    }

    public initSet<T>(key: string, value: T[]) {
        const operationValue: IMapValue = {type: ValueType[ValueType.Set], value};
        const op: IMapOperation = {
            key,
            type: "initSet",
            value: operationValue,
        };
        this.initSetCore(op.key, op.value);
        this.submitLocalOperation(op);
    }

    public initSetCore(key: string, value: IMapValue) {
        const newValue: IMapValue = {type: ValueType[ValueType.Set], value: DistributedSet.initSet(value.value)};
        this.data.set(key, newValue);
        this.events.emit("valueChanged", { key });
    }

    public insertSet<T>(key: string, value: T): T[] {
        const operationValue: IMapValue = {type: ValueType[ValueType.Set], value};
        const op: IMapOperation = {
            key,
            type: "insertSet",
            value: operationValue,
        };
        this.insertSetCore(op.key, op.value);
        this.submitLocalOperation(op);
        return this.data.get(key).value;
    }

    public insertSetCore(key: string, value: IMapValue) {
        const newValue: IMapValue = {
            type: ValueType[ValueType.Set],
            value: DistributedSet.addElement(this.get(key), value.value),
        };
        this.data.set(key, newValue);
        this.events.emit("valueChanged", { key });
        this.events.emit("setElementAdded", {key, value: value.value});
    }

    public deleteSet<T>(key: string, value: T): T[] {
        const operationValue: IMapValue = {type: ValueType[ValueType.Set], value};
        const op: IMapOperation = {
            key,
            type: "deleteSet",
            value: operationValue,
        };
        this.deleteSetCore(op.key, op.value);
        this.submitLocalOperation(op);
        return this.data.get(key).value;
    }

    public deleteSetCore(key: string, value: IMapValue) {
        const newValue: IMapValue = {
            type: ValueType[ValueType.Set],
            value: DistributedSet.removeElement(this.get(key), value.value),
        };
        this.data.set(key, newValue);
        this.events.emit("valueChanged", { key });
        this.events.emit("setElementRemoved", {key, value: value.value});
    }

    private translateValue(value: IMapValue): any {
        if (value.type === ValueType[ValueType.Collaborative]) {
            const collabMapValue = value.value as ICollaborativeMapValue;
            return this.document.get(collabMapValue.id);
        } else {
            return value.value;
        }
    }
}

/**
 * Implementation of a map collaborative object
 */
export class CollaborativeMap extends api.CollaborativeObject implements IMap {
    private view: MapView;

    /**
     * Constructs a new collaborative map. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(
        document: api.IDocument,
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
        return Promise.resolve(Array.from(this.view.keys()));
    }

    /**
     * Retrieves the value with the given key from the map.
     */
    public get(key: string) {
        return Promise.resolve(this.view.get(key));
    }

    public async wait<T>(key: string): Promise<T> {
        return this.view.wait<T>(key);
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

    public createCounter(key: string, value?: number, min?: number, max?: number): Promise<ICounter> {
        value = getOrDefault(value, 0);
        min = getOrDefault(min, Number.MIN_SAFE_INTEGER);
        max = getOrDefault(max, Number.MAX_SAFE_INTEGER);
        if (!(typeof value === "number" && typeof min === "number" && typeof max === "number")) {
            throw new Error("parameters should be of number type!");
        }
        if (value < min || value > max) {
            throw new Error("Initial value exceeds the counter range!");
        }
        this.view.initCounter(key, value);
        return Promise.resolve(new Counter(this, key, min, max));
    }

    public incrementCounter(key: string, value: number, min: number, max: number): Promise<any> {
        if (typeof value !== "number") {
            return Promise.reject("Incremental amount should be a number.");
        }
        const compatible = this.ensureCompatibility(key, ValueType[ValueType.Counter]);
        if (compatible.reject !== null) {
            return compatible.reject;
        }
        const currentData = compatible.data;
        const currentValue = currentData.value as number;
        const nextValue = currentValue + value;
        if ((nextValue < min) || (nextValue > max)) {
            return Promise.reject("Error: Counter range exceeded!");
        }
        return Promise.resolve(this.view.incrementCounter(key, value, min, max));
    }

    public getCounterValue(key: string): Promise<number> {
        const compatible = this.ensureCompatibility(key, ValueType[ValueType.Counter]);
        return compatible.reject !== null ? compatible.reject : Promise.resolve(compatible.data.value);
    }

    public createSet<T>(key: string, value?: T[]): Promise<ISet<T>> {
        value = getOrDefault(value, []);
        this.view.initSet(key, value);
        return Promise.resolve(new DistributedSet(this, key));
    }

    public insertSet<T>(key: string, value: T): Promise<T[]> {
        const compatible = this.ensureCompatibility(key, ValueType[ValueType.Set]);
        return compatible.reject !== null ? compatible.reject : Promise.resolve(this.view.insertSet(key, value));
    }

    public deleteSet<T>(key: string, value: T): Promise<T[]> {
        const compatible = this.ensureCompatibility(key, ValueType[ValueType.Set]);
        return compatible.reject !== null ? compatible.reject : Promise.resolve(this.view.deleteSet(key, value));
    }

    public enumerateSet<T>(key: string): Promise<T[]> {
        const compatible = this.ensureCompatibility(key, ValueType[ValueType.Set]);
        return compatible.reject !== null ? compatible.reject : Promise.resolve(compatible.data.value);
    }

    public snapshot(): api.ITree {
        const tree: api.ITree = {
            entries: [
                {
                    path: snapshotFileName,
                    type: api.TreeEntry[api.TreeEntry.Blob],
                    value: {
                        contents: this.view.serialize(),
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
    public getView(): Promise<IMapView> {
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
                case "initSet":
                    this.view.initSetCore(op.key, op.value);
                    break;
                case "insertSet":
                    this.view.insertSetCore(op.key, op.value);
                    break;
                case "deleteSet":
                    this.view.deleteSetCore(op.key, op.value);
                    break;
                default:
                    throw new Error("Unknown operation");
            }
        }

        this.events.emit("op", message);
    }

    // Check if key exists in the map and if the value type is of the desired type (e.g., set, counter etc.)
    private ensureCompatibility(key: string, targetType: string): IMapDataCompatibility {
        const currentData = this.view.getMapValue(key);
        if (currentData === undefined) {
            return {
                data: null,
                reject: Promise.reject("Error: No key found!"),
            };
        }
        if (currentData.type !== targetType) {
            return {
                data: null,
                reject: Promise.reject("Error: Incompatible value type!"),
            };
        }
        return {
            data: currentData,
            reject: null,
        };
    }
}

/**
 * The extension that defines the map
 */
export class MapExtension implements api.IExtension {
    public static Type = "https://graph.microsoft.com/types/map";

    public type: string = MapExtension.Type;

    public load(
        document: api.IDocument,
        id: string,
        sequenceNumber: number,
        services: api.IDistributedObjectServices,
        version: resources.ICommit,
        header: string): IMap {

        return new CollaborativeMap(document, id, sequenceNumber, services, version, header);
    }

    public create(document: api.IDocument, id: string): IMap {
        return new CollaborativeMap(document, id, 0);
    }
}

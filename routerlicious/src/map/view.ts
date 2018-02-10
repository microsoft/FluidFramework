import { EventEmitter } from "events";
import hasIn = require("lodash/hasIn");
import * as api from "../api-core";
import { ICounter, IMapView, ISet } from "../data-types";
import { Counter } from "./counter";
import { ICollaborativeMapValue, IMapOperation, IMapValue, ValueType } from "./definitions";
import { CollaborativeMap } from "./map";
import { DistributedSet } from "./set";

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
        if (hasIn(value, "__collaborativeObject__")) {
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
            switch (value.type) {
                case ValueType[ValueType.Set]:
                    const set = value.value as ISet<any>;
                    serialized[key] = { type: value.type, value: set.entries() };
                    break;
                case ValueType[ValueType.Counter]:
                    const counter = value.value as Counter;
                    serialized[key] = {
                        type: value.type,
                        value: {
                            max: counter.getMax(),
                            min: counter.getMin(),
                            value: counter.get(),
                        },
                    };
                    break;
                default:
                    serialized[key] = value;
            }
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

    public initCounter(object: CollaborativeMap, key: string, value: number,  min: number, max: number): ICounter {
        const operationValue: IMapValue = {
            type: ValueType[ValueType.Counter],
            value: {
                value,
                min,
                max,
            },
        };
        const op: IMapOperation = {
            key,
            type: "initCounter",
            value: operationValue,
        };
        this.submitLocalOperation(op);
        return this.initCounterCore(object, op.key, op.value);
    }

    public loadCounter(object: CollaborativeMap, key: string, value: number, min: number, max: number) {
        const newCounter = new Counter(object, key, min, max);
        const newValue: IMapValue = { type: ValueType[ValueType.Counter], value: newCounter.init(value) as ICounter };
        this.data.set(key, newValue);
    }

    public initCounterCore(object: CollaborativeMap, key: string, value: IMapValue): ICounter {
        const newCounter = new Counter(object, key, value.value.min, value.value.max);
        newCounter.init(value.value.value);
        const newValue: IMapValue = { type: ValueType[ValueType.Counter], value: newCounter as ICounter };
        this.data.set(key, newValue);
        this.events.emit("valueChanged", { key });
        this.events.emit("initCounter", {key, value: newValue.value});
        return newValue.value;
    }

    public incrementCounter(key: string, value: number) {
        const operationValue: IMapValue = {type: ValueType[ValueType.Counter], value};
        const op: IMapOperation = {
            key,
            type: "incrementCounter",
            value: operationValue,
        };
        this.submitLocalOperation(op);
        return this.incrementCounterCore(op.key, op.value);
    }

    public incrementCounterCore(key: string, value: IMapValue): ICounter {
        const currentCounter = this.get(key) as Counter;
        currentCounter.set(currentCounter.get() + value.value);
        this.events.emit("valueChanged", { key });
        this.events.emit("incrementCounter", {key, value: value.value});
        return currentCounter as ICounter;
    }

    public initSet<T>(object: CollaborativeMap, key: string, value: T[]): ISet<any> {
        const operationValue: IMapValue = {type: ValueType[ValueType.Set], value};
        const op: IMapOperation = {
            key,
            type: "initSet",
            value: operationValue,
        };
        this.submitLocalOperation(op);
        return this.initSetCore(object, op.key, op.value);
    }

    public loadSet<T>(object: CollaborativeMap, key: string, value: T[]) {
        const newSet = new DistributedSet<T>(object, key);
        const newValue: IMapValue = { type: ValueType[ValueType.Set], value: newSet.init(value) as ISet<T> };
        this.data.set(key, newValue);
    }

    public initSetCore<T>(object: CollaborativeMap, key: string, value: IMapValue): ISet<T> {
        const newSet = new DistributedSet<T>(object, key);
        newSet.init(value.value);
        const newValue: IMapValue = {type: ValueType[ValueType.Set], value: newSet as ISet<T>};
        this.data.set(key, newValue);
        this.events.emit("valueChanged", { key });
        this.events.emit("setCreated", {key, value: newValue.value});
        return newValue.value;
    }

    public insertSet<T>(key: string, value: T): ISet<T> {
        const operationValue: IMapValue = {type: ValueType[ValueType.Set], value};
        const op: IMapOperation = {
            key,
            type: "insertSet",
            value: operationValue,
        };
        this.insertSetCore(op.key, op.value);
        this.submitLocalOperation(op);
        return this.data.get(key).value as ISet<T>;
    }

    public insertSetCore<T>(key: string, value: IMapValue) {
        const currentSet = this.get(key) as ISet<T>;
        currentSet.getInternalSet().add(value.value);
        this.events.emit("valueChanged", { key });
        this.events.emit("setElementAdded", {key, value: value.value});
    }

    public deleteSet<T>(key: string, value: T): ISet<T> {
        const operationValue: IMapValue = {type: ValueType[ValueType.Set], value};
        const op: IMapOperation = {
            key,
            type: "deleteSet",
            value: operationValue,
        };
        this.deleteSetCore(op.key, op.value);
        this.submitLocalOperation(op);
        return this.data.get(key).value as ISet<T>;
    }

    public deleteSetCore<T>(key: string, value: IMapValue) {
        const currentSet = this.get(key) as ISet<T>;
        currentSet.getInternalSet().delete(value.value);
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

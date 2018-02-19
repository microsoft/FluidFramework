import * as assert from "assert";
import hasIn = require("lodash/hasIn");
import * as api from "../api-core";
import { ICounter, IMapView, ISet } from "../data-types";
import { Counter } from "./counter";
import { IMapOperation, IMapValue, ValueType } from "./definitions";
import { CollaborativeMap } from "./map";
import { DistributedSet } from "./set";

export class MapView implements IMapView {
    private data = new Map<string, IMapValue>();
    private distributedObjects = new Map<string, api.ICollaborativeObject>();

    constructor(private map: CollaborativeMap, private document: api.IDocument, id: string) {
    }

    public async populate(data: {[key: string]: IMapValue }): Promise<void> {
        const distributedObjectsP = new Array<Promise<api.ICollaborativeObject>>();

        // tslint:disable-next-line:forin
        for (const key in data) {
            const value = data[key];
            const enumValue = ValueType[value.type];
            switch (enumValue) {
                case ValueType.Set:
                    const set = new DistributedSet(key, value.value, this.map);
                    this.data.set(
                        key,
                        {
                            type: ValueType[ValueType.Set],
                            value: set,
                        });
                    break;

                case ValueType.Counter:
                    const counter = new Counter(
                        key,
                        value.value.value,
                        value.value.min,
                        value.value.max,
                        this.map);
                    this.data.set(
                        key,
                        {
                            type: ValueType[ValueType.Counter],
                            value: counter,
                        });
                    break;

                case ValueType.Collaborative:
                    const distributedObject = this.document.getAsync(value.value);
                    distributedObjectsP.push(distributedObject);
                    break;

                default:
                    this.data.set(key, data[key]);
                    break;
            }

            // Stash local references to the distributed objects
            const resolvedObjects = await Promise.all(distributedObjectsP);
            for (const resolvedObject of resolvedObjects) {
                this.distributedObjects.set(resolvedObject.id, resolvedObject);
                this.data.set(
                    key,
                    {
                        type: ValueType[ValueType.Counter],
                        value: resolvedObject,
                    });
            }
        }
    }

    public forEach(callbackFn: (value, key) => void) {
        this.data.forEach((value, key) => {
            callbackFn(value.value, key);
        });
    }

    public get(key: string) {
        if (!this.data.has(key)) {
            return undefined;
        }

        const value = this.data.get(key);
        return value.value;
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
                    this.map.removeListener("valueChanged", callback);
                }
            };

            this.map.on("valueChanged", callback);
        });
    }

    public has(key: string): boolean {
        return this.data.has(key);
    }

    public set(key: string, value: any): void {
        let operationValue: IMapValue;
        if (hasIn(value, "__collaborativeObject__")) {
            // Attach the collab object to the document. If already attached the attach call will noop
            value.attach();

            operationValue = {
                type: ValueType[ValueType.Collaborative],
                value,
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
        this.map.submitMapMessage(op);
    }

    public delete(key: string): void {
        const op: IMapOperation = {
            key,
            type: "delete",
        };

        this.deleteCore(op.key);
        this.map.submitMapMessage(op);
    }

    public keys(): IterableIterator<string> {
        return this.data.keys();
    }

    public clear(): void {
        const op: IMapOperation = {
            type: "clear",
        };

        this.clearCore();
        this.map.submitMapMessage(op);
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
                case ValueType[ValueType.Collaborative]:
                    serialized[key] = {
                        type: value.type,
                        value: (value.value as api.ICollaborativeObject).id,
                    };
                    break;
                default:
                    serialized[key] = value;
            }
        });
        return JSON.stringify(serialized);
    }

    public setCore(key: string, value: any) {
        this.data.set(key, value);
        this.map.emit("valueChanged", { key });
    }

    public prepareSetCore(key: string, value: IMapValue): Promise<api.ICollaborativeObject> {
        return value.type === ValueType[ValueType.Collaborative]
            ? this.document.getAsync(value.value)
            : Promise.resolve(null);
    }

    public clearCore() {
        this.data.clear();
        this.map.emit("clear");
    }

    public deleteCore(key: string) {
        this.data.delete(key);
        this.map.emit("valueChanged", { key });
    }

    public initCounter(key: string, value: number,  min: number, max: number): ICounter {
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
        this.map.submitMapMessage(op);
        return this.initCounterCore(op.key, op.value);
    }

    public initCounterCore(key: string, value: IMapValue): ICounter {
        const newCounter = new Counter(
            key,
            value.value.value,
            value.value.min,
            value.value.max,
            this.map);
        const newValue: IMapValue = { type: ValueType[ValueType.Counter], value: newCounter as ICounter };
        this.data.set(key, newValue);
        this.map.emit("valueChanged", { key });
        this.map.emit("initCounter", {key, value: newValue.value});
        return newValue.value;
    }

    public initSet<T>(key: string, value: T[]): ISet<any> {
        const operationValue: IMapValue = {type: ValueType[ValueType.Set], value};
        const op: IMapOperation = {
            key,
            type: "initSet",
            value: operationValue,
        };
        this.map.submitMapMessage(op);
        return this.initSetCore(op.key, op.value);
    }

    public initSetCore<T>(key: string, value: IMapValue): ISet<T> {
        const newSet = new DistributedSet<T>(key, value.value, this.map);
        const newValue: IMapValue = {type: ValueType[ValueType.Set], value: newSet as ISet<T>};
        this.data.set(key, newValue);
        this.map.emit("valueChanged", { key });
        this.map.emit("setCreated", {key, value: newValue.value});
        return newValue.value;
    }

    public deleteSetCore<T>(key: string, value: IMapValue) {
        assert.equal(value.type, ValueType[ValueType.Set]);
        const set = this.get(key) as DistributedSet<T>;
        set.delete(value.value, false);
    }

    public incrementCounterCore(key: string, value: IMapValue) {
        assert.equal(value.type, ValueType[ValueType.Counter]);
        const counter = this.get(key) as Counter;
        counter.increment(value.value, false);
    }

    public insertSetCore<T>(key: string, value: IMapValue) {
        assert.equal(value.type, ValueType[ValueType.Set]);
        const set = this.get(key) as DistributedSet<T>;
        set.add(value.value, false);
    }
}

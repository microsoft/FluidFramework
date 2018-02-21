import * as assert from "assert";
import hasIn = require("lodash/hasIn");
import * as api from "../api-core";
import { ICounter, IMapFilter, IMapView, ISet } from "../data-types";
import { Counter } from "./counter";
import { IMapOperation, IMapValue, ValueType } from "./definitions";
import { CollaborativeMap } from "./map";
import { DistributedSet } from "./set";

interface ITranslation {
    key: string;
    value: IMapValue;
}

/**
 * Default filter handles translations to or from core map values
 */
class DefaultFilter implements IMapFilter {
    constructor(private map: CollaborativeMap, private document: api.IDocument) {
    }

    public async fill(key: string, remote: IMapValue): Promise<ITranslation> {
        const enumValue = ValueType[remote.type];

        let translatedValue: any;
        switch (enumValue) {
            case ValueType.Set:
                const set = new DistributedSet(key, remote.value, this.map);
                translatedValue = set;
                break;

            case ValueType.Counter:
                const counter = new Counter(
                    key,
                    remote.value.value,
                    remote.value.min,
                    remote.value.max,
                    this.map);
                translatedValue = counter;
                break;

            case ValueType.Collaborative:
                const distributedObject = await this.document.get(remote.value);
                translatedValue = distributedObject;
                break;

            default:
                translatedValue = remote.value;
                break;
        }

        return {
            key,
            value: translatedValue,
        };
    }

    public spill(local: any): IMapValue {
        if (hasIn(local, "__collaborativeObject__")) {
            const distributedObject = local as api.ICollaborativeObject;

            // Attach the collab object to the document. If already attached the attach call will noop.
            // This feels slightly out of place here since it has a side effect. But is part of spilling a document.
            // Not sure if there is some kind of prep call to separate the op creation from things needed to make it
            // (like attaching)
            if (!this.map.isLocal()) {
                distributedObject.attach();
            }

            return {
                type: ValueType[ValueType.Collaborative],
                value: distributedObject.id,
            };
        } else if (local instanceof DistributedSet) {
            return {
                type: ValueType[ValueType.Set],
                value: local.entries(),
            };
        } else if (local instanceof Counter) {
            return {
                type: ValueType[ValueType.Counter],
                value: {
                    max: local.getMax(),
                    min: local.getMin(),
                    value: local.get(),
                },
            };
        } else {
            return {
                type: ValueType[ValueType.Plain],
                value: local,
            };
        }
    }
}

export class MapView implements IMapView {
    private data = new Map<string, any>();
    private filter: IMapFilter;

    constructor(private map: CollaborativeMap, document: api.IDocument, id: string) {
        this.filter = new DefaultFilter(map, document);
    }

    public async populate(data: {[key: string]: IMapValue }): Promise<void> {
        const translationsP = new Array<Promise<ITranslation>>();

        // tslint:disable-next-line:forin
        for (const key in data) {
            const value = data[key];
            const translationP = this.filter.fill(key, value);
            translationsP.push(translationP);
        }

        const translations = await Promise.all(translationsP);
        for (const translation of translations) {
            this.data.set(translation.key, translation.value);
        }
    }

    public forEach(callbackFn: (value, key) => void) {
        this.data.forEach((value, key) => {
            callbackFn(value, key);
        });
    }

    public get(key: string) {
        if (!this.data.has(key)) {
            return undefined;
        }

        const value = this.data.get(key);
        return value;
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

    public attachAll() {
        for (const [, value] of this.data) {
            if (hasIn(value, "__collaborativeObject__")) {
                (value as api.ICollaborativeObject).attach();
            }
        }
    }

    public set(key: string, value: any): void {
        let operationValue: IMapValue = this.filter.spill(value);

        const op: IMapOperation = {
            key,
            type: "set",
            value: operationValue,
        };

        this.setCore(op.key, value);
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
            serialized[key] = this.filter.spill(value);
        });
        return JSON.stringify(serialized);
    }

    public setCore(key: string, value: IMapValue) {
        this.data.set(key, value);
        this.map.emit("valueChanged", { key });
    }

    public async prepareSetCore(key: string, value: IMapValue): Promise<IMapValue> {
        const translation = await this.filter.fill(key, value);
        return translation.value;
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
        this.data.set(key, newCounter);
        this.map.emit("valueChanged", { key });
        this.map.emit("initCounter", {key, value: newCounter});
        return newCounter;
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
        this.data.set(key, newSet);
        this.map.emit("valueChanged", { key });
        this.map.emit("setCreated", { key, value: newSet });
        return newSet;
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

    public attachFilter(filter: IMapFilter): void {
        // Should you only be able to attach a filter prior to any messages being processed - i.e. the map
        // must have been in a snapshot load state?
        this.filter = filter;
    }
}

import * as assert from "assert";
import hasIn = require("lodash/hasIn");
import * as api from "../api-core";
import { IMapView, ISet, IValueOpEmitter, IValueType } from "../data-types";
import { IMapOperation, IMapValue, ValueType } from "./definitions";
import { CollaborativeMap, IMapMessageHandler } from "./map";
import { DistributedSet } from "./set";

interface ITranslation {
    key: string;
    value: IMapValue;
}

/**
 * Default filter handles translations to or from core map values
 */
class DefaultFilter {
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
        } else {
            return {
                type: ValueType[ValueType.Plain],
                value: local,
            };
        }
    }
}

class ValueOpEmitter implements IValueOpEmitter {
    constructor(private type: string, private key: string, private map: CollaborativeMap) {
    }

    public emit(name: string, params: any) {
        const op: IMapOperation = {
            key: this.key,
            type: this.type,
            value: {
                type: name,
                value: params,
            },
        };

        this.map.submitMapMessage(op);
    }
}

export class MapView implements IMapView {
    private data = new Map<string, any>();
    private filter: DefaultFilter;
    private valueTypes = new Map<string, IValueType<any>>();

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

    public set<T = any>(key: string, value: any, type?: string): T {
        let operationValue: IMapValue;
        if (type) {
            const valueType = this.valueTypes.get(type);
            if (!valueType) {
                throw new Error("Unknown value type specified");
            }

            // set operationValue first with the raw value params prior to doing the load
            operationValue = {
                type,
                value,
            };
            value = valueType.factory.load(new ValueOpEmitter(type, key, this.map), value);
        } else {
            operationValue = this.filter.spill(value);
        }

        const op: IMapOperation = {
            key,
            type: "set",
            value: operationValue,
        };

        this.setCore(op.key, value);
        this.map.submitMapMessage(op);

        return value;
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

    public registerValueType<T>(type: IValueType<T>): IMapMessageHandler {
        this.valueTypes.set(type.name, type);

        function getOpHandler(op: IMapOperation) {
            const handler = type.ops.get(op.value.type);
            if (!handler) {
                throw new Error("Unknown type message");
            }

            return handler;
        }

        return {
            prepare: async (op) => {
                const handler = getOpHandler(op);
                const old = this.get(op.key);
                return handler.prepare(old, op.value.value);
            },

            process: (op, context) => {
                const handler = getOpHandler(op);
                const old = this.get(op.key);
                handler.process(old, op.value.value, context);
            },
        };
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

    public insertSetCore<T>(key: string, value: IMapValue) {
        assert.equal(value.type, ValueType[ValueType.Set]);
        const set = this.get(key) as DistributedSet<T>;
        set.add(value.value, false);
    }
}

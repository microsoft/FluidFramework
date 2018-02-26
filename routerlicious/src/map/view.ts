import hasIn = require("lodash/hasIn");
import * as api from "../api-core";
import { IMapView, IValueOpEmitter, IValueType, SerializeFilter } from "../data-types";
import { IMapOperation, IMapValue, ValueType } from "./definitions";
import { CollaborativeMap, IMapMessageHandler } from "./map";

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
        this.map.emit("valueChanged", { key: this.key });
    }
}

export interface ILocalViewElement {
    // The type of local value
    localType: string;

    // The actual local value
    localValue: any;
}

export class MapView implements IMapView {
    private data = new Map<string, ILocalViewElement>();
    private valueTypes = new Map<string, IValueType<any>>();

    constructor(private map: CollaborativeMap, private document: api.IDocument, id: string) {
    }

    public async populate(data: {[key: string]: IMapValue }): Promise<void> {
        const localValuesP = new Array<Promise<{key: string, value: ILocalViewElement}>>();

        // tslint:disable-next-line:forin
        for (const key in data) {
            const value = data[key];
            const localValueP = this.fill(key, value).then((filledValue) => ({key, value: filledValue}));
            localValuesP.push(localValueP);
        }

        const localValues = await Promise.all(localValuesP);
        for (const localValue of localValues) {
            this.data.set(localValue.key, localValue.value);
        }
    }

    public forEach(callbackFn: (value, key) => void) {
        this.data.forEach((value, key) => {
            callbackFn(value.localValue, key);
        });
    }

    public get(key: string) {
        if (!this.data.has(key)) {
            return undefined;
        }

        // Let's stash the *type* of the object on the key
        const value = this.data.get(key);

        return value.localValue;
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
            if (hasIn(value.localValue, "__collaborativeObject__")) {
                (value.localValue as api.ICollaborativeObject).attach();
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
            const valueType = hasIn(value, "__collaborativeObject__")
                ? ValueType[ValueType.Collaborative]
                : ValueType[ValueType.Plain];
            operationValue = this.spill({ localType: valueType, localValue: value });
        }

        const op: IMapOperation = {
            key,
            type: "set",
            value: operationValue,
        };

        this.setCore(
            op.key,
            {
                localType: operationValue.type,
                localValue: value,
            });
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
    public serialize(filter: SerializeFilter): string {
        const serialized: any = {};
        this.data.forEach((value, key) => {
            const spilledValue = this.spill(value);
            const filteredValue = filter(key, spilledValue.value, spilledValue.type);
            serialized[key] = { type: spilledValue.type, value: filteredValue } as IMapValue;
        });
        return JSON.stringify(serialized);
    }

    public setCore(key: string, value: ILocalViewElement) {
        this.data.set(key, value);
        this.map.emit("valueChanged", { key });
    }

    public async prepareSetCore(key: string, value: IMapValue): Promise<ILocalViewElement> {
        const translation = await this.fill(key, value);
        return translation;
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
                this.map.emit("valueChanged", { key: op.key });
            },
        };
    }

    private async fill(key: string, remote: IMapValue): Promise<ILocalViewElement> {
        let translatedValue: any;
        if (remote.type === ValueType[ValueType.Collaborative]) {
            const distributedObject = await this.document.get(remote.value);
            translatedValue = distributedObject;
        } else if (remote.type === ValueType[ValueType.Plain]) {
            translatedValue = remote.value;
        } else if (this.valueTypes.has(remote.type)) {
            const valueType = this.valueTypes.get(remote.type);
            translatedValue = valueType.factory.load(new ValueOpEmitter(remote.type, key, this.map), remote.value);
        } else {
            return Promise.reject("Unknown value type");
        }

        return {
            localType: remote.type,
            localValue: translatedValue,
        };
    }

    private spill(local: ILocalViewElement): IMapValue {
        if (local.localType === ValueType[ValueType.Collaborative]) {
            const distributedObject = local.localValue as api.ICollaborativeObject;

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
        } else if (this.valueTypes.has(local.localType)) {
            const valueType = this.valueTypes.get(local.localType);
            return {
                type: local.localType,
                value: valueType.factory.store(local.localValue),
            };
        } else {
            return {
                type: ValueType[ValueType.Plain],
                value: local.localValue,
            };
        }
    }
}

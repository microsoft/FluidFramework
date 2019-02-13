import { ISharedObject, SharedObject, ValueType } from "@prague/api-definitions";
import { IRuntime, ISequencedObjectMessage } from "@prague/runtime-definitions";
// tslint:disable-next-line
import { IMapOperation, IMapValue } from "./definitions";
import { IValueOpEmitter, SerializeFilter } from "./interfaces";
import { SharedMap } from "./map";

class ValueOpEmitter implements IValueOpEmitter {
    constructor(private readonly type: string, private readonly key: string, private readonly map: SharedMap) {
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
        this.map.emit("valueChanged", { key: this.key }, true, null);
    }
}

export interface ILocalViewElement {
    // The type of local value
    localType: string;

    // The actual local value
    localValue: any;
}

export class MapView  {
    public readonly data = new Map<string, ILocalViewElement>();

    constructor(private readonly map: SharedMap, private readonly runtime: IRuntime, id: string) {
    }

    public async populate(data: {[key: string]: IMapValue }): Promise<void> {
        const localValuesP = new Array<Promise<{key: string, value: ILocalViewElement}>>();

        // tslint:disable-next-line:forin
        for (const key in data) {
            const value = data[key];
            const localValueP = this.fill(key, value)
                .then((filledValue) => ({key, value: filledValue}));
            localValuesP.push(localValueP);
        }

        const localValues = await Promise.all(localValuesP);
        for (const localValue of localValues) {
            this.data.set(localValue.key, localValue.value);
        }
    }

    // TODO: fix to pass-through when meta-data moved to separate map
    public forEach(callbackFn: (value: any, key: any, map: Map<string, any>) => void) {
        this.data.forEach((value, key, m) => {
            callbackFn(value.localValue, key, m);
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

    public getMap() {
        return this.map;
    }

    public async wait<T>(key: string): Promise<T> {
        // Return immediately if the value already exists
        if (this.has(key)) {
            /* tslint:disable:no-unsafe-any */
            /* tslint:disable:no-object-literal-type-assertion */
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
            if (value.localValue instanceof SharedObject) {
                value.localValue.attach();
            }
        }
    }

    public set<T = any>(key: string, value: any, type?: string): T {
        let operationValue: IMapValue;
        if (type) {
            const valueType = this.map.getValueType(type);
            if (!valueType) {
                throw new Error(`Unknown type '${type}' specified`);
            }

            // set operationValue first with the raw value params prior to doing the load
            operationValue = {
                type,
                value,
            };
            // tslint:disable-next-line:no-parameter-reassignment
            value = valueType.factory.load(new ValueOpEmitter(type, key, this.map), value);
        } else {
            const valueType = value instanceof SharedObject
                ? ValueType[ValueType.Shared]
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
            },
            true,
            null);
        this.map.submitMapMessage(op);

        return value;
    }

    public delete(key: string) {
        const op: IMapOperation = {
            key,
            type: "delete",
        };

        const successfullyRemoved = this.deleteCore(op.key, true, null);
        this.map.submitMapMessage(op);
        return successfullyRemoved;
    }

    public keys(): IterableIterator<string> {
        return this.data.keys();
    }

    public clear(): void {
        const op: IMapOperation = {
            type: "clear",
        };

        this.clearCore(true, null);
        this.map.submitMapMessage(op);
    }

    /**
     * Serializes the shared map to a JSON string
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

    public setCore(key: string, value: ILocalViewElement, local: boolean, op: ISequencedObjectMessage) {
        this.data.set(key, value);
        this.map.emit("valueChanged", { key }, local, op);
    }

    public prepareSetCore(key: string, value: IMapValue): Promise<ILocalViewElement> {
        return this.fill(key, value);
    }

    public clearCore(local: boolean, op: ISequencedObjectMessage) {
        this.data.clear();
        this.map.emit("clear", local, op);
    }

    public deleteCore(key: string, local: boolean, op: ISequencedObjectMessage) {
        const successfullyRemoved = this.data.delete(key);
        this.map.emit("valueChanged", { key }, local, op);
        return successfullyRemoved;
    }

    private async fill(key: string, remote: IMapValue): Promise<ILocalViewElement> {
        let translatedValue: any;
        if (remote.type === ValueType[ValueType.Shared]) {
            const distributedObject = await this.runtime.getChannel(remote.value);
            translatedValue = distributedObject;
        } else if (remote.type === ValueType[ValueType.Plain]) {
            translatedValue = remote.value;
        } else if (this.map.hasValueType(remote.type)) {
            const valueType = this.map.getValueType(remote.type);
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
        if (local.localType === ValueType[ValueType.Shared]) {
            const distributedObject = local.localValue as ISharedObject;

            // Attach the collab object to the document. If already attached the attach call will noop.
            // This feels slightly out of place here since it has a side effect. But is part of spilling a document.
            // Not sure if there is some kind of prep call to separate the op creation from things needed to make it
            // (like attaching)
            if (!this.map.isLocal()) {
                distributedObject.attach();
            }

            return {
                type: ValueType[ValueType.Shared],
                value: distributedObject.id,
            };
        } else if (this.map.hasValueType(local.localType)) {
            const valueType = this.map.getValueType(local.localType);
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

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentHandle,
    IComponentHandleContext,
    IComponentSerializer,
    ISerializedHandle,
} from "@prague/component-core-interfaces";
import { IComponentRuntime } from "@prague/runtime-definitions";
import {
    ISharedObject,
    parseHandles,
    serializeHandles,
    SharedObject,
    ValueType,
} from "@prague/shared-object-common";
import { CounterValueType } from "./counter";
import { ISerializableValue, IValueOpEmitter, IValueOperation, IValueType } from "./interfaces";

export interface ILocalValue {
    readonly type: string;
    readonly value: any;
    makeSerializable(
        serializer: IComponentSerializer,
        context: IComponentHandleContext,
        bind: IComponentHandle): ISerializableValue;
}

export const valueTypes: ReadonlyArray<IValueType<any>> = [
    new CounterValueType(),
];

export class PlainLocalValue implements ILocalValue {
    constructor(public readonly value: any) {
    }

    public get type(): string {
        return ValueType[ValueType.Plain];
    }

    public makeSerializable(
        serializer: IComponentSerializer,
        context: IComponentHandleContext,
        bind: IComponentHandle,
    ): ISerializableValue {
        // Stringify to convert to the serialized handle values - and then parse in order to create
        // a POJO for the op
        const value = serializeHandles(this.value, serializer, context, bind);

        return {
            type: this.type,
            value,
        };
    }
}

export class SharedLocalValue implements ILocalValue {
    constructor(public readonly value: ISharedObject) {
    }

    public get type(): string {
        return ValueType[ValueType.Shared];
    }

    public makeSerializable(): ISerializableValue {
        return {
            type: this.type,
            value: this.value.id,
        };
    }
}

// TODO: Should maybe be a generic
export class ValueTypeLocalValue implements ILocalValue {
    constructor(public readonly value: any, private readonly valueType: IValueType<any>) {
    }

    public get type(): string {
        return this.valueType.name;
    }

    public makeSerializable(
        serializer: IComponentSerializer,
        context: IComponentHandleContext,
        bind: IComponentHandle,
    ): ISerializableValue {
        const storedValueType = this.valueType.factory.store(this.value);
        const value = serializeHandles(storedValueType, serializer, context, bind);

        return {
            type: this.type,
            value,
        };
    }

    public getOpHandler(opName: string): IValueOperation<any> {
        const handler = this.valueType.ops.get(opName);
        if (!handler) {
            throw new Error("Unknown type message");
        }

        return handler;
    }
}

export class LocalValueMaker {
    private readonly valueTypes = new Map<string, IValueType<any>>();

    constructor(private readonly runtime: IComponentRuntime) {
    }

    public registerValueType<T>(type: IValueType<T>) {
        this.valueTypes.set(type.name, type);
    }

    public fromSerializable(serializable: ISerializableValue, emitter?: IValueOpEmitter): ILocalValue {
        if (serializable.type === ValueType[ValueType.Plain] || serializable.type === ValueType[ValueType.Shared]) {
            // migrate from old shared value to handles
            if (serializable.type === ValueType[ValueType.Shared]) {
                serializable.type = ValueType[ValueType.Plain];
                const handle: ISerializedHandle = {
                    type: "__fluid_handle__",
                    url: serializable.value as string,
                };
                serializable.value = handle;
            }

            const translatedValue = parseHandles(
                serializable.value,
                this.runtime.IComponentSerializer,
                this.runtime.IComponentHandleContext);

            return new PlainLocalValue(translatedValue);
        } else if (this.valueTypes.has(serializable.type)) {
            const valueType = this.valueTypes.get(serializable.type);

            serializable.value = parseHandles(
                serializable.value,
                this.runtime.IComponentSerializer,
                this.runtime.IComponentHandleContext);

            const localValue = valueType.factory.load(emitter, serializable.value);
            return new ValueTypeLocalValue(localValue, valueType);
        } else {
            throw new Error(`Unknown value type "${serializable.type}"`);
        }
    }

    public fromInMemory(value: any) {
        if (SharedObject.is(value)) {
            throw new Error("SharedObject sets are no longer supported. Instead set the SharedObject handle.");
        }

        return new PlainLocalValue(value);
    }

    public makeValueType(type: string, emitter: IValueOpEmitter, params: any) {
        // params is the initialization information for the value type, e.g. initial count on a counter
        // type is the value type Name to initialize, e.g. "counter"
        const valueType = this.loadValueType(params, type, emitter);
        return new ValueTypeLocalValue(valueType, this.valueTypes.get(type));
    }

    private loadValueType(value: any, type: string, emitter: IValueOpEmitter) {
        const valueType = this.valueTypes.get(type);
        if (!valueType) {
            throw new Error(`Unknown type '${type}' specified`);
        }

        return valueType.factory.load(emitter, value);
    }
}

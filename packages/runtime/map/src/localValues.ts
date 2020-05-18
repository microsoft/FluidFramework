/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentHandle,
    IComponentHandleContext,
    IComponentSerializer,
    ISerializedHandle,
} from "@microsoft/fluid-component-core-interfaces";
import { IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";
import {
    ISharedObject,
    parseHandles,
    serializeHandles,
    SharedObject,
    ValueType,
} from "@microsoft/fluid-shared-object-base";
import {
    ISerializableValue,
    ISerializedValue,
    IValueOpEmitter,
    IValueOperation,
    IValueType,
} from "@microsoft/fluid-map-definitions";
import { CounterValueType } from "./counter";

/**
 * A local value to be stored in a container type DDS.
 */
export interface ILocalValue {
    /**
     * Type indicator of the value stored within.
     */
    readonly type: string;

    /**
     * The in-memory value stored within.
     */
    readonly value: any;

    /**
     * Retrieve the serialized form of the value stored within.
     * @param serializer - Component runtime's serializer
     * @param context - Component runtime's handle context
     * @param bind - Container type's handle
     * @returns The serialized form of the contained value
     */
    makeSerialized(
        serializer: IComponentSerializer,
        context: IComponentHandleContext,
        bind: IComponentHandle,
    ): ISerializedValue;
}

export function makeSerializable(
    localValue: ILocalValue,
    serializer: IComponentSerializer,
    context: IComponentHandleContext,
    bind: IComponentHandle): ISerializableValue {
    const value = localValue.makeSerialized(serializer, context, bind);
    return {
        type: value.type,
        value: value.value && JSON.parse(value.value),
    };
}

/**
 * Supported value types.
 */
export const valueTypes: readonly IValueType<any>[] = [
    new CounterValueType(),
];

/**
 * Manages a contained plain value.  May also contain shared object handles.
 */
export class PlainLocalValue implements ILocalValue {
    /**
     * Create a new PlainLocalValue.
     * @param value - The value to store, which may contain shared object handles
     */
    constructor(public readonly value: any) {
    }

    /**
     * {@inheritDoc ILocalValue."type"}
     */
    public get type(): string {
        return ValueType[ValueType.Plain];
    }

    /**
     * {@inheritDoc ILocalValue.makeSerialized}
     */
    public makeSerialized(
        serializer: IComponentSerializer,
        context: IComponentHandleContext,
        bind: IComponentHandle,
    ): ISerializedValue {
        // Stringify to convert to the serialized handle values - and then parse in order to create
        // a POJO for the op
        const value = serializeHandles(this.value, serializer, context, bind);

        return {
            type: this.type,
            value,
        };
    }
}

/**
 * SharedLocalValue exists for supporting older documents and is now deprecated.
 * @deprecated
 */
export class SharedLocalValue implements ILocalValue {
    /**
     * Create a new SharedLocalValue.
     * @param value - The shared object to store
     * @deprecated
     */
    constructor(public readonly value: ISharedObject) {
    }

    /**
     * {@inheritDoc ILocalValue."type"}
     * @deprecated
     */
    public get type(): string {
        return ValueType[ValueType.Shared];
    }

    /**
     * {@inheritDoc ILocalValue.makeSerialized}
     * @deprecated
     */
    public makeSerialized(): ISerializedValue {
        return {
            type: this.type,
            value: this.value.id,
        };
    }
}

/**
 * Manages a contained value type.
 *
 * @privateRemarks
 * TODO: Should maybe be a generic
 *
 * @alpha
 */
export class ValueTypeLocalValue implements ILocalValue {
    /**
     * Create a new ValueTypeLocalValue.
     * @param value - The instance of the value type stored within
     * @param valueType - The type object of the value type stored within
     */
    constructor(public readonly value: any, private readonly valueType: IValueType<any>) {
    }

    /**
     * {@inheritDoc ILocalValue."type"}
     */
    public get type(): string {
        return this.valueType.name;
    }

    /**
     * {@inheritDoc ILocalValue.makeSerialized}
     */
    public makeSerialized(
        serializer: IComponentSerializer,
        context: IComponentHandleContext,
        bind: IComponentHandle,
    ): ISerializedValue {
        const storedValueType = this.valueType.factory.store(this.value);
        const value = serializeHandles(storedValueType, serializer, context, bind);

        return {
            type: this.type,
            value,
        };
    }

    /**
     * Get the handler for a given op of this value type.
     * @param opName - The name of the operation that needs processing
     * @returns The object which can process the given op
     */
    public getOpHandler(opName: string): IValueOperation<any> {
        const handler = this.valueType.ops.get(opName);
        if (!handler) {
            throw new Error("Unknown type message");
        }

        return handler;
    }
}

/**
 * A LocalValueMaker enables a container type DDS to produce and store local values with minimal awareness of how
 * those objects are stored, serialized, and deserialized.
 */
export class LocalValueMaker {
    /**
     * The value types this maker is able to produce.
     */
    private readonly valueTypes = new Map<string, IValueType<any>>();

    /**
     * Create a new LocalValueMaker.
     * @param runtime - The runtime this maker will be associated with
     */
    constructor(private readonly runtime: IComponentRuntime) {
    }

    /**
     * Register a value type this maker will be able to produce.
     * @param type - The value type to register
     * @alpha
     */
    public registerValueType<T>(type: IValueType<T>) {
        this.valueTypes.set(type.name, type);
    }

    /**
     * Create a new local value from an incoming serialized value.
     * @param serializable - The serializable value to make local
     * @param emitter - The value op emitter, if the serializable is a value type
     */
    public fromSerializable(serializable: ISerializableValue, emitter?: IValueOpEmitter): ILocalValue {
        if (serializable.type === ValueType[ValueType.Plain] || serializable.type === ValueType[ValueType.Shared]) {
            // Migrate from old shared value to handles
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

    /**
     * Create a new local value containing a given plain object.
     * @param value - The value to store
     * @returns An ILocalValue containing the value
     */
    public fromInMemory(value: any): ILocalValue {
        if (SharedObject.is(value)) {
            throw new Error("SharedObject sets are no longer supported. Instead set the SharedObject handle.");
        }

        return new PlainLocalValue(value);
    }

    /**
     * Create a new local value containing a value type.
     * @param type - The type of the value type to create
     * @param emitter - The IValueOpEmitter object that the new value type will use to emit ops
     * @param params - The initialization arguments for the value type
     * @returns An ILocalValue containing the new value type
     * @alpha
     */
    public makeValueType(type: string, emitter: IValueOpEmitter, params: any): ILocalValue {
        // params is the initialization information for the value type, e.g. initial count on a counter
        // type is the value type Name to initialize, e.g. "counter"
        const valueType = this.loadValueType(params, type, emitter);
        return new ValueTypeLocalValue(valueType, this.valueTypes.get(type));
    }

    /**
     * Create a new value type.
     * @param params - The initialization arguments for the value type
     * @param type - The type of value type to create
     * @param emitter - The IValueOpEmitter object that the new value type will use to emit ops
     * @returns The new value type
     * @alpha
     */
    private loadValueType(params: any, type: string, emitter: IValueOpEmitter): any {
        const valueType = this.valueTypes.get(type);
        if (!valueType) {
            throw new Error(`Unknown type '${type}' specified`);
        }

        return valueType.factory.load(emitter, params);
    }
}

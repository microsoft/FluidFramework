/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
    IFluidSerializer,
    ISerializedHandle,
    parseHandles,
    serializeHandles,
    ValueType,
} from "@fluidframework/shared-object-base";
import {
    ISerializableValue,
    ISerializedValue,
    IValueOpEmitter,
    IValueOperation,
    IValueType,
} from "./mapKernelInterfaces";

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
     * @param serializer - Data store runtime's serializer
     * @param bind - Container type's handle
     * @returns The serialized form of the contained value
     */
    makeSerialized(
        serializer: IFluidSerializer,
        bind: IFluidHandle,
    ): ISerializedValue;
}

export function makeSerializable(
    localValue: ILocalValue,
    serializer: IFluidSerializer,
    bind: IFluidHandle): ISerializableValue {
    const value = localValue.makeSerialized(serializer, bind);
    return {
        type: value.type,
        value: value.value && JSON.parse(value.value),
    };
}

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
        serializer: IFluidSerializer,
        bind: IFluidHandle,
    ): ISerializedValue {
        // Stringify to convert to the serialized handle values - and then parse in order to create
        // a POJO for the op
        const value = serializeHandles(this.value, serializer, bind);

        return {
            type: this.type,
            value,
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
        serializer: IFluidSerializer,
        bind: IFluidHandle,
    ): ISerializedValue {
        const storedValueType = this.valueType.factory.store(this.value);
        const value = serializeHandles(storedValueType, serializer, bind);

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
     * @param serializer - The serializer to serialize / parse handles.
     */
    constructor(private readonly serializer: IFluidSerializer) {
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
     */
    public fromSerializable(serializable: ISerializableValue): ILocalValue {
        // Migrate from old shared value to handles
        if (serializable.type === ValueType[ValueType.Shared]) {
            serializable.type = ValueType[ValueType.Plain];
            const handle: ISerializedHandle = {
                type: "__fluid_handle__",
                url: serializable.value as string,
            };
            serializable.value = handle;
        }

        const translatedValue = parseHandles(serializable.value, this.serializer);

        return new PlainLocalValue(translatedValue);
    }

    /**
     * Create a new local value from an incoming serialized value for value type
     * @param serializable - The serializable value to make local
     * @param emitter - The value op emitter, if the serializable is a value type
     */
    public fromSerializableValueType(serializable: ISerializableValue, emitter: IValueOpEmitter): ILocalValue {
        if (this.valueTypes.has(serializable.type)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const valueType = this.valueTypes.get(serializable.type)!;

            serializable.value = parseHandles(serializable.value, this.serializer);

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
        const valueType = this.loadValueType(params, type, emitter);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return new ValueTypeLocalValue(valueType, this.valueTypes.get(type)!);
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

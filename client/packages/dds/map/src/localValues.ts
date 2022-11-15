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
} from "./interfaces";

/**
 * A local value to be stored in a container type Distributed Data Store (DDS).
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
 * Enables a container type {@link https://fluidframework.com/docs/build/dds/ | DDS} to produce and store local
 * values with minimal awareness of how those objects are stored, serialized, and deserialized.
 */
export class LocalValueMaker {
    /**
     * Create a new LocalValueMaker.
     * @param serializer - The serializer to serialize / parse handles.
     */
    constructor(private readonly serializer: IFluidSerializer) {
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
     * Create a new local value containing a given plain object.
     * @param value - The value to store
     * @returns An ILocalValue containing the value
     */
    public fromInMemory(value: any): ILocalValue {
        return new PlainLocalValue(value);
    }
}

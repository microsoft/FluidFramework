/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
    IFluidSerializer,
    serializeHandles,
} from "@fluidframework/shared-object-base";
import {
    ISerializableValue,
    ISerializedValue,
    IValueOperation,
    IValueType,
} from "./defaultMapInterfaces";

/**
 * A local value to be stored in a container type DDS.
 */
export interface ILocalValue<T = any> {
    /**
     * Type indicator of the value stored within.
     */
    readonly type: string;

    /**
     * The in-memory value stored within.
     */
    readonly value: T;

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
 * Manages a contained value type.
 *
 * @alpha
 */
export class ValueTypeLocalValue<T> implements ILocalValue<T> {
    /**
     * Create a new ValueTypeLocalValue.
     * @param value - The instance of the value type stored within
     * @param valueType - The type object of the value type stored within
     */
    constructor(public readonly value: T, private readonly valueType: IValueType<T>) {
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
    public getOpHandler(opName: string): IValueOperation<T> {
        const handler = this.valueType.ops.get(opName);
        if (!handler) {
            throw new Error("Unknown type message");
        }

        return handler;
    }
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	HandlesEncoded,
	IFluidSerializer,
	ISerializedHandle,
	JsonString,
	OpContent,
	parseHandles,
	parseJson,
	serializeHandles,
	ValueType,
} from "@fluidframework/shared-object-base";
// eslint-disable-next-line import/no-deprecated
import { ISerializableValue, ISerializedValue } from "./interfaces";

/**
 * A local value to be stored in a container type Distributed Data Store (DDS).
 *
 * @public
 */
export interface ILocalValue<T extends OpContent<"fullHandles"> = OpContent<"fullHandles">> {
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
	makeSerialized(serializer: IFluidSerializer, bind: IFluidHandle): ISerializedValue<T>;
}

//* NEXT STEP keep plumbing T around e.g. to ISerializableValue

/**
 * Converts the provided `localValue` to its serialized form.
 *
 * @param localValue - The value to serialize.
 * @param serializer - Data store runtime's serializer.
 * @param bind - Container type's handle.
 *
 * @see {@link ILocalValue.makeSerialized}
 */
export function makeSerializable<T extends OpContent<"fullHandles">>(
	localValue: ILocalValue<T>,
	serializer: IFluidSerializer,
	bind: IFluidHandle,
	// eslint-disable-next-line import/no-deprecated
): ISerializableValue<T> {
	const { type, value } = localValue.makeSerialized(serializer, bind);
	return {
		type,
		value: value && parseJson(value),
	};
}

/**
 * Manages a contained plain value.  May also contain shared object handles.
 */
export class PlainLocalValue<T extends OpContent<"fullHandles">> implements ILocalValue<T> {
	/**
	 * Create a new PlainLocalValue.
	 * @param value - The value to store, which may contain shared object handles
	 */
	public constructor(public readonly value: T) {}

	/**
	 * {@inheritDoc ILocalValue."type"}
	 */
	public get type(): string {
		return ValueType[ValueType.Plain];
	}

	/**
	 * {@inheritDoc ILocalValue.makeSerialized}
	 */
	public makeSerialized(serializer: IFluidSerializer, bind: IFluidHandle): ISerializedValue<T> {
		// Stringify to convert to the serialized handle values - and then parse in order to create
		// a POJO for the op
		const value = serializeHandles(this.value, serializer, bind) as JsonString<
			HandlesEncoded<T>
		>; //* Fix handling of Primitive case to remove this cast

		return {
			type: this.type,
			value,
		};
	}
}

/**
 * Enables a container type {@link https://fluidframework.com/docs/build/dds/ | DDS} to produce and store local
 * values with minimal awareness of how those objects are stored, serialized, and deserialized.
 *
 * @public
 */
export class LocalValueMaker {
	/**
	 * Create a new LocalValueMaker.
	 * @param serializer - The serializer to serialize / parse handles.
	 */
	public constructor(private readonly serializer: IFluidSerializer) {}

	/**
	 * Create a new local value from an incoming serialized value.
	 * @param serializable - The serializable value to make local
	 */
	// eslint-disable-next-line import/no-deprecated
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

		const translatedValue: OpContent<"fullHandles"> = parseHandles(
			serializable.value,
			this.serializer,
		);

		return new PlainLocalValue(translatedValue);
	}

	/**
	 * Create a new local value containing a given plain object.
	 * @param value - The value to store
	 * @returns An ILocalValue containing the value
	 */
	public fromInMemory(value: unknown): ILocalValue {
		return new PlainLocalValue(value);
	}
}

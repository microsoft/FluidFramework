/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { ISerializedHandle } from "@fluidframework/runtime-utils/internal";
import type { IFluidSerializer } from "@fluidframework/shared-object-base/internal";
import {
	ValueType,
	parseHandles,
	serializeHandles,
} from "@fluidframework/shared-object-base/internal";

// eslint-disable-next-line import/no-deprecated
import type { ISerializableValue, ISerializedValue } from "./internalInterfaces.js";

/**
 * A local value to be stored in a container type Distributed Data Store (DDS).
 */
export interface ILocalValue {
	/**
	 * The in-memory value stored within.
	 */
	readonly value: unknown;
}

/**
 * Converts the provided `localValue` to its serialized form.
 *
 * @param localValue - The value to serialize.
 * @param serializer - Data store runtime's serializer.
 * @param bind - Container type's handle.
 */
export function makeSerializable(
	value: unknown,
	serializer: IFluidSerializer,
	bind: IFluidHandle,
	// eslint-disable-next-line import/no-deprecated
): ISerializableValue {
	const { value: serializedValue } = makeSerialized(value, serializer, bind);
	return {
		type: ValueType[ValueType.Plain],
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		value: serializedValue === undefined ? undefined : JSON.parse(serializedValue),
	};
}

/**
 * Convert a local value to its serialized form.
 */
export const makeSerialized = (
	value: unknown,
	serializer: IFluidSerializer,
	bind: IFluidHandle,
): ISerializedValue => {
	// Stringify to convert to the serialized handle values - and then parse in order to create
	// a POJO for the op
	const serializedValue = serializeHandles(value, serializer, bind);

	return {
		type: ValueType[ValueType.Plain],
		value: serializedValue,
	};
};

/**
 * Very old versions of Fluid permitted a different type of stored value, which represented a
 * SharedObject held directly.  This functionality has since been replaced with handles.
 * This function ensures we convert any remaining "shared" values to handles.
 * @param serializable - The serializable value to potentially convert.
 */
export const getValueFromSerializable = (
	// eslint-disable-next-line import/no-deprecated
	serializable: ISerializableValue,
	serializer: IFluidSerializer,
	bind: IFluidHandle,
): unknown => {
	// Migrate from old shared value to handles
	if (serializable.type === ValueType[ValueType.Shared]) {
		const handle: ISerializedHandle = {
			type: "__fluid_handle__",
			url: serializable.value as string,
		};
		// NOTE: here we require the use of `parseHandles` because the roundtrip
		// through a string is necessary to resolve the absolute path of
		// legacy handles (`ValueType.Shared`)
		return serializer.encode(parseHandles(handle, serializer), bind);
	}

	return serializable.value;
};

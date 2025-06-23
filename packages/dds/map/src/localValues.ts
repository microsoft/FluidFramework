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
 * @internal
 */
export interface ILocalValue {
	/**
	 * The in-memory value stored within.
	 */
	readonly value: unknown;
}

/**
 * Convert a value to its serialized form, i.e. to be used in ops and summaries.
 */
export const serializeValue = (
	value: unknown,
	serializer: IFluidSerializer,
	bind: IFluidHandle,
): ISerializedValue => {
	const serializedValue = serializeHandles(value, serializer, bind);

	return {
		type: ValueType[ValueType.Plain],
		value: serializedValue,
	};
};

/**
 * Very old versions of Fluid permitted a different type of stored value, which represented a
 * SharedObject held directly.  This functionality has since been replaced with handles.
 *
 * If the passed serializable is one of these old values, this function will mutate it to a modern
 * value with a handle.  Otherwise it does nothing.
 * @param serializable - The serializable value to potentially convert.
 */
export const migrateIfSharedSerializable = (
	// eslint-disable-next-line import/no-deprecated
	serializable: ISerializableValue,
	serializer: IFluidSerializer,
	bind: IFluidHandle,
): void => {
	// Migrate from old shared value to handles
	if (serializable.type === ValueType[ValueType.Shared]) {
		serializable.type = ValueType[ValueType.Plain];
		const handle: ISerializedHandle = {
			type: "__fluid_handle__",
			url: serializable.value as string,
		};
		// NOTE: here we require the use of `parseHandles` because the roundtrip
		// through a string is necessary to resolve the absolute path of
		// legacy handles (`ValueType.Shared`)
		serializable.value = serializer.encode(parseHandles(handle, serializer), bind);
	}
};

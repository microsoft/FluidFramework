/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	type IFluidSerializer,
	serializeHandles,
} from "@fluidframework/shared-object-base/internal";

import type { IntervalCollection } from "./intervalCollection.js";
import type { ISerializableIntervalCollection } from "./intervalCollectionMapInterfaces.js";

export function makeSerializable(
	localValue: IntervalCollection,
	serializer: IFluidSerializer,
	bind: IFluidHandle,
	version: "1" | "2",
): ISerializableIntervalCollection {
	const storedValueType = localValue.serializeInternal(version);

	const value = serializeHandles(storedValueType, serializer, bind);
	return {
		type: "sharedStringIntervalCollection",
		value: value && JSON.parse(value),
	};
}

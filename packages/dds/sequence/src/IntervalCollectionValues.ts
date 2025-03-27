/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	serializeHandles,
	IFluidSerializer,
} from "@fluidframework/shared-object-base/internal";

import {
	SequenceIntervalCollectionValueType,
	type IntervalCollection,
} from "./intervalCollection.js";
import { ISerializableIntervalCollection } from "./intervalCollectionMapInterfaces.js";

export function makeSerializable(
	localValue: IntervalCollection,
	serializer: IFluidSerializer,
	bind: IFluidHandle,
): ISerializableIntervalCollection {
	const storedValueType = SequenceIntervalCollectionValueType.factory.store(localValue);

	const value = serializeHandles(storedValueType, serializer, bind);
	return {
		type: SequenceIntervalCollectionValueType.Name,
		value: value && JSON.parse(value),
	};
}

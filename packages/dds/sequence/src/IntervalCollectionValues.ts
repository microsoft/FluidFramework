/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	serializeHandles,
	IFluidSerializer,
} from "@fluidframework/shared-object-base/internal";

import type { IntervalCollection } from "./intervalCollection.js";
import {
	IIntervalCollectionOperation,
	IIntervalCollectionType,
	ISerializableIntervalCollection,
	ISerializedIntervalCollection,
} from "./intervalCollectionMapInterfaces.js";
import { type ISerializableInterval, IntervalOpType } from "./intervals/index.js";

/**
 * A local value to be stored in a container type DDS.
 */
export interface ILocalIntervalCollection {
	/**
	 * Type indicator of the value stored within.
	 */
	readonly type: string;

	/**
	 * The in-memory value stored within.
	 */
	readonly value: IntervalCollection;

	/**
	 * Retrieve the serialized form of the value stored within.
	 * @param serializer - Data store runtime's serializer
	 * @param bind - Container type's handle
	 * @returns The serialized form of the contained value
	 */
	makeSerialized(
		serializer: IFluidSerializer,
		bind: IFluidHandle,
	): ISerializedIntervalCollection;
}

export function makeSerializable<T extends ISerializableInterval>(
	localValue: ILocalIntervalCollection,
	serializer: IFluidSerializer,
	bind: IFluidHandle,
): ISerializableIntervalCollection {
	const value = localValue.makeSerialized(serializer, bind);
	return {
		type: value.type,
		value: value.value && JSON.parse(value.value),
	};
}

/**
 * Manages a contained value type.
 */
export class IntervalCollectionTypeLocalValue<T extends ISerializableInterval>
	implements ILocalIntervalCollection
{
	/**
	 * Create a new ValueTypeLocalValue.
	 * @param value - The instance of the value type stored within
	 * @param valueType - The type object of the value type stored within
	 */
	constructor(
		public readonly value: IntervalCollection,
		private readonly valueType: IIntervalCollectionType<T>,
	) {}

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
	): ISerializedIntervalCollection {
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
	public getOpHandler(opName: IntervalOpType): IIntervalCollectionOperation<T> {
		const handler = this.valueType.ops.get(opName);
		if (!handler) {
			throw new Error("Unknown type message");
		}

		return handler;
	}
}

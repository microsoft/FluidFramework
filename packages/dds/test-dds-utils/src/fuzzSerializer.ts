/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IFluidHandleContext,
	type IFluidHandleInternal,
} from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import {
	isSerializedHandle,
	type ISerializedHandle,
	RemoteFluidObjectHandle,
} from "@fluidframework/runtime-utils/internal";
import {
	FluidSerializer,
	type HandleBinder,
} from "@fluidframework/shared-object-base/internal";

import { PoisonedDDSFuzzHandle } from "./ddsFuzzHandle.js";

/**
 * Data Store serializer implementation
 * @internal
 */
export class DDSFuzzSerializer extends FluidSerializer {
	public constructor(
		context: IFluidHandleContext,
		private readonly clientId: string,
		private readonly strict: boolean = true,
	) {
		super(context);
	}

	/**
	 * If the given 'value' is an encoded IFluidHandle, returns the decoded IFluidHandle.
	 * Otherwise returns the original 'value'.  Used by 'decode()' and 'parse()'.
	 */
	protected readonly decodeValue = (value: unknown): unknown => {
		const baseResult = super.decodeValue(value);
		// If 'value' is a serialized IFluidHandle return the deserialized result.
		if (isSerializedHandle(value)) {
			assert(
				baseResult instanceof RemoteFluidObjectHandle,
				"Expected serialized handle to decode to a handle by FluidSerializer",
			);

			if (isPoisonedHandle(value)) {
				if (this.strict && this.clientId !== value.creatingClientId) {
					throw new Error(
						`Poisoned handle created by client ${value.creatingClientId} should not be referenced by client ${this.clientId}, but was found at deserialization time!`,
					);
				}

				return new PoisonedDDSFuzzHandle(
					baseResult.absolutePath,
					baseResult.routeContext,
					value.creatingClientId,
				);
			}
		}

		return baseResult;
	};

	/**
	 * Encodes the given IFluidHandle into a JSON-serializable form,
	 * also binding it to another node to ensure it attaches at the right time.
	 * @param handle - The IFluidHandle to serialize.
	 * @param bind - The binding context for the handle (the handle will become attached whenever this context is attached).
	 * @returns The serialized handle.
	 */
	protected bindAndEncodeHandle(
		handle: IFluidHandleInternal,
		bind: HandleBinder,
	): ISerializedHandle & Partial<IPoisonedHandle> {
		const baseEncoding = super.bindAndEncodeHandle(handle, bind);
		if (isPoisonedHandle(handle)) {
			return {
				...baseEncoding,
				poisoned: true,
				creatingClientId: handle.creatingClientId,
			};
		}
		return baseEncoding;
	}
}

/**
 * NOTE: used in both serialized and non-serialized form.
 */
export interface IPoisonedHandle {
	poisoned: boolean;
	creatingClientId: string;
}

function isPoisonedHandle<T extends ISerializedHandle | IFluidHandleInternal>(
	value: T,
): value is T & IPoisonedHandle {
	return "poisoned" in value && value.poisoned === true;
}

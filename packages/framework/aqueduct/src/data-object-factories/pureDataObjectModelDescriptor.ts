/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidObject } from "@fluidframework/core-interfaces";
import type {
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";

import type {
	PureDataObject,
	DataObjectTypes,
	IDataObjectProps,
} from "../data-objects/index.js";

import type { MultiFormatModelDescriptor } from "./multiFormatDataStoreFactory.js";

/**
 * Creates a {@link MultiFormatModelDescriptor} for a {@link PureDataObject} ctor.
 *
 * When supplied as the sole descriptor to a {@link MultiFormatDataStoreFactory} the resulting data store behaves
 * equivalently (for typical usage) to one produced by {@link PureDataObjectFactory} for the same `ctor` & shared objects:
 *
 * - New data store creation eagerly constructs the object and runs its first-time initialization before attachment.
 * - Loading an existing data store constructs the object lazily when the entry point is first requested.
 * - Subsequent `get` calls return the same instance.
 */
export function pureDataObjectModelDescriptor<
	TObj extends PureDataObject<I> & FluidObject,
	I extends DataObjectTypes = DataObjectTypes,
>(
	ctor: new (props: IDataObjectProps<I>) => TObj,
	sharedObjects?: readonly IChannelFactory[],
): MultiFormatModelDescriptor<TObj, I> {
	// Map runtime => instantiated data object. Each runtime instance corresponds to one data store instance.
	const instances = new WeakMap<IFluidDataStoreRuntime, TObj>();

	return {
		async create(props: IDataObjectProps<I>): Promise<void> {
			const instance = new ctor(props);
			instances.set(props.runtime, instance);
			// For new data stores run first-time initialization before attachment (mirrors PureDataObjectFactory behavior).
			await instance.finishInitialization(false);
		},
		// Single-format helpers can always report a positive probe. If multiple descriptors are used callers should
		// provide a more selective probe implementation.
		probe(): boolean {
			return true;
		},
		async get(props: IDataObjectProps<I>): Promise<TObj> {
			let instance = instances.get(props.runtime);
			if (instance === undefined) {
				// Existing data store path: lazily construct & complete existing initialization on first access.
				instance = new ctor(props);
				instances.set(props.runtime, instance);
				await instance.finishInitialization(true);
			}
			return instance;
		},
		sharedObjects,
	};
}

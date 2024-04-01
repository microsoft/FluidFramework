/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type FluidObject, type IEvent } from "@fluidframework/core-interfaces";
import { type IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { type IFluidDataStoreContext } from "@fluidframework/runtime-definitions/internal";
import { type AsyncFluidObjectProvider } from "@fluidframework/synthesize";

/**
 * This type is used as the base generic input to DataObject and PureDataObject.
 * @alpha
 */
export interface DataObjectTypes {
	/**
	 * Represents a type that will define optional providers that will be injected.
	 */
	OptionalProviders?: FluidObject;
	/**
	 * The initial state type that the produced data object may take during creation.
	 */
	// TODO: Use a real type here.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	InitialState?: any;
	/**
	 * Represents events that will be available in the EventForwarder.
	 */
	Events?: IEvent;
}

/**
 * @alpha
 */
export interface IDataObjectProps<I extends DataObjectTypes = DataObjectTypes> {
	readonly runtime: IFluidDataStoreRuntime;
	readonly context: IFluidDataStoreContext;
	readonly providers: AsyncFluidObjectProvider<I["OptionalProviders"]>;
	readonly initProps?: I["InitialState"];
}

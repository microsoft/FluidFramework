/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent, FluidObject } from "@fluidframework/core-interfaces";
import { AsyncFluidObjectProvider } from "@fluidframework/synthesize";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";

/**
 * This type is used as the base generic input to DataObject and PureDataObject.
 */
export interface DataObjectTypes {
	/**
	 * represents a type that will define optional providers that will be injected
	 */
	OptionalProviders?: FluidObject;
	/**
	 * the initial state type that the produced data object may take during creation
	 */
	InitialState?: any;
	/**
	 * represents events that will be available in the EventForwarder
	 */
	Events?: IEvent;
}

export interface IDataObjectProps<I extends DataObjectTypes = DataObjectTypes> {
	readonly runtime: IFluidDataStoreRuntime;
	readonly context: IFluidDataStoreContext;
	readonly providers: AsyncFluidObjectProvider<I["OptionalProviders"]>;
	readonly initProps?: I["InitialState"];
}

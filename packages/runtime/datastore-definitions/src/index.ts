/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This library defines the interfaces required to implement and/or communicate
 * with a data store.
 *
 * @packageDocumentation
 */

export type {
	IChannel,
	IChannelFactory,
	IChannelServices,
	IChannelStorageService,
	IDeltaConnection,
	IDeltaHandler,
} from "./channel.js";
export type {
	IDeltaManagerErased,
	IFluidDataStoreRuntime,
	IFluidDataStoreRuntimeAlpha,
	IFluidDataStoreRuntimeEvents,
	IFluidDataStoreRuntimeInternalConfig,
} from "./dataStoreRuntime.js";
export type {
	Internal_InterfaceOfJsonableTypesWith,
	Jsonable,
	JsonableTypeWith,
} from "./jsonable.js";
export type { Serializable } from "./serializable.js";
export type { IChannelAttributes } from "./storage.js";

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

export {
	IChannel,
	IChannelFactory,
	IChannelServices,
	IChannelStorageService,
	IDeltaConnection,
	IDeltaHandler,
} from "./channel.js";
export { IFluidDataStoreRuntime, IFluidDataStoreRuntimeEvents } from "./dataStoreRuntime.js";
export type {
	Jsonable,
	JsonableTypeWith,
	Internal_InterfaceOfJsonableTypesWith,
} from "./jsonable.js";
export { Serializable } from "./serializable.js";
export { IChannelAttributes } from "./storage.js";

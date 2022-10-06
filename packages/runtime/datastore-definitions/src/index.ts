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
	IDeltaHandler,
	IDeltaConnection,
	IChannelStorageService,
	IChannelServices,
	IChannelFactory,
} from "./channel";
export { IFluidDataStoreRuntimeEvents, IFluidDataStoreRuntime } from "./dataStoreRuntime";
export { Jsonable } from "./jsonable";
export { Serializable } from "./serializable";
export { IChannelAttributes } from "./storage";

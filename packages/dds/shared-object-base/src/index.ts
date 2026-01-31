/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { type ISharedObjectHandle, isISharedObjectHandle } from "./handle.js";
export { FluidSerializer, type IFluidSerializer } from "./serializer.js";
export {
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	SharedObject,
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	SharedObjectCore,
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	type ISharedObjectKind,
	type SharedObjectKind,
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	createSharedObjectKind,
} from "./sharedObject.js";
// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
export type { ISharedObject, ISharedObjectEvents } from "./types.js";
export {
	createSingleBlobSummary,
	makeHandlesSerializable,
	parseHandles,
	serializeHandles,
	bindHandles,
	type IChannelView,
} from "./utils.js";
export { ValueType } from "./valueType.js";
export {
	type SharedKernel,
	thisWrap,
	type KernelArgs,
	makeSharedObjectKind,
	type SharedKernelFactory,
	type FactoryOut,
	type SharedObjectOptions,
	mergeAPIs,
} from "./sharedObjectKernel.js";

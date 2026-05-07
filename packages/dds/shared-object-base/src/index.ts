/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { type ISharedObjectHandle, isISharedObjectHandle } from "./handle.js";
export { FluidSerializer, type IFluidSerializer } from "./serializer.js";
export {
	createSharedObjectKind,
	type ISharedObjectKind,
	SharedObject,
	SharedObjectCore,
	type SharedObjectKind,
} from "./sharedObject.js";
export {
	type FactoryOut,
	type KernelArgs,
	makeSharedObjectKind,
	mergeAPIs,
	type SharedKernel,
	type SharedKernelFactory,
	type SharedObjectOptions,
	thisWrap,
} from "./sharedObjectKernel.js";
export type { ISharedObject, ISharedObjectEvents } from "./types.js";
export {
	bindHandles,
	createSingleBlobSummary,
	type IChannelView,
	makeHandlesSerializable,
	parseHandles,
	serializeHandles,
} from "./utils.js";
export { ValueType } from "./valueType.js";

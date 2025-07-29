/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { type ISharedObjectHandle, isISharedObjectHandle } from "./handle.js";
export { FluidSerializer, type IFluidSerializer } from "./serializer.js";
export {
	SharedObject,
	SharedObjectCore,
	type ISharedObjectKind,
	type SharedObjectKind,
	createSharedObjectKind,
} from "./sharedObject.js";
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

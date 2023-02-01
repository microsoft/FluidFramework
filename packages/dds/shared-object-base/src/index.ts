/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	FluidSerializer,
	IFluidSerializer,
	ISerializedHandle,
	isSerializedHandle,
} from "./serializer";
export { SharedObject, SharedObjectCore } from "./sharedObject";
export { SummarySerializer } from "./summarySerializer";
export { ISharedObject, ISharedObjectEvents } from "./types";
export {
	createSingleBlobSummary,
	makeHandlesSerializable,
	parseHandles,
	serializeHandles,
} from "./utils";
export { ValueType } from "./valueType";

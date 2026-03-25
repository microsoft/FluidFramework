/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	dataStoreCompatDetailsForRuntime,
	dataStoreCoreCompatDetails,
	runtimeSupportRequirementsForDataStore,
} from "./dataStoreLayerCompatState.js";
export {
	DataStoreMessageType,
	FluidDataStoreRuntime,
	type ISharedObjectRegistry,
	type LocalFluidDataStoreRuntimeMessage,
	mixinRequestHandler,
	mixinSummaryHandler,
} from "./dataStoreRuntime.js";
export { FluidObjectHandle } from "./fluidHandle.js";

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { FluidObjectHandle } from "./fluidHandle.js";
export {
	DataStoreMessageType,
	FluidDataStoreRuntime,
	type ISharedObjectRegistry,
	mixinRequestHandler,
	mixinSummaryHandler,
} from "./dataStoreRuntime.js";
export {
	dataStoreCoreCompatDetails,
	dataStoreCompatDetailsForRuntime,
	runtimeSupportRequirementsForDataStore,
} from "./dataStoreLayerCompatState.js";

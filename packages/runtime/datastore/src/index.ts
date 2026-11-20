/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { FluidObjectHandle } from "./fluidHandle.js";
export { LeafChannelRuntime } from "./leafChannelRuntime.js";
export {
	DataStoreMessageType,
	FluidDataStoreRuntime,
	type ISharedObjectRegistry,
	type ISharedObjectRegistryInternal,
	type LocalFluidDataStoreRuntimeMessage,
	mixinRequestHandler,
	mixinSummaryHandler,
} from "./dataStoreRuntime.js";
export {
	legacySharedObjectTypeAliases,
	LegacyTypeAwareRegistry,
} from "./sharedObjectRegistry.js";
export {
	dataStoreCoreCompatDetails,
	dataStoreCompatDetailsForRuntime,
	runtimeSupportRequirementsForDataStore,
} from "./dataStoreLayerCompatState.js";

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
export { runGarbageCollection } from "./garbageCollector";
export {
	trimLeadingAndTrailingSlashes,
	trimLeadingSlashes,
	trimTrailingSlashes,
	cloneGCData,
	unpackChildNodesGCDetails,
	unpackChildNodesUsedRoutes,
	removeRouteFromAllNodes,
	concatGarbageCollectionStates,
	concatGarbageCollectionData,
	GCDataBuilder,
} from "./utils";
export { IGCResult } from "./interfaces";

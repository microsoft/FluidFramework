/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
export { runGarbageCollection } from "./garbageCollector";
export { IGCResult } from "./interfaces";
export {
	cloneGCData,
	concatGarbageCollectionData,
	concatGarbageCollectionStates,
	GCDataBuilder,
	getGCDataFromSnapshot,
	removeRouteFromAllNodes,
	trimLeadingAndTrailingSlashes,
	trimLeadingSlashes,
	trimTrailingSlashes,
	unpackChildNodesGCDetails,
	unpackChildNodesUsedRoutes,
} from "./utils";

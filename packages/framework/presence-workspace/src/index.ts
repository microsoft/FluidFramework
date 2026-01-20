/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type {
	ClientUpdateEntry,
	PresenceStatesInternal,
	RuntimeLocalUpdateOptions,
	ValueElementMap,
} from "./presenceStates.js";
export {
	createPresenceStates,
	mergeUntrackedDatastore,
	mergeValueDirectory,
} from "./presenceStates.js";

export type {
	LocalStateUpdateOptions,
	StateDatastore,
} from "./stateDatastore.js";
export { datastoreFromHandle } from "./stateDatastore.js";

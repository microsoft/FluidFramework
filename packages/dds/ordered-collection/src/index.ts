/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ConsensusCallback,
	ConsensusResult,
	type IConsensusOrderedCollection,
	type IConsensusOrderedCollectionEvents,
	type IConsensusOrderedCollectionFactory,
	type IOrderedCollection,
	type ISnapshotable,
} from "./interfaces.js";
export { ConsensusQueueFactory, ConsensusQueue } from "./consensusOrderedCollectionFactory.js";
export { ConsensusOrderedCollection } from "./consensusOrderedCollection.js";
export { ConsensusQueueClass } from "./consensusQueue.js";
export { acquireAndComplete, waitAcquireAndComplete } from "./testUtils.js";

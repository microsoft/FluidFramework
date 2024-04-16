/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	ConsensusCallback,
	ConsensusResult,
	IConsensusOrderedCollection,
	IConsensusOrderedCollectionEvents,
	IConsensusOrderedCollectionFactory,
	IOrderedCollection,
	ISnapshotable,
} from "./interfaces.js";
export { ConsensusQueueFactory } from "./consensusOrderedCollectionFactory.js";
export { ConsensusOrderedCollection } from "./consensusOrderedCollection.js";
export { ConsensusQueue } from "./consensusQueue.js";
export { acquireAndComplete, waitAcquireAndComplete } from "./testUtils.js";

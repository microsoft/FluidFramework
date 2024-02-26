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
} from "./interfaces";
export { ConsensusQueueFactory } from "./consensusOrderedCollectionFactory";
export { ConsensusOrderedCollection } from "./consensusOrderedCollection";
export { ConsensusQueue } from "./consensusQueue";
export { acquireAndComplete, waitAcquireAndComplete } from "./testUtils";

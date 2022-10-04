/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { ConsensusOrderedCollection } from "./consensusOrderedCollection";
export { ConsensusQueue } from "./consensusQueue";
export {
    ConsensusResult,
    ConsensusCallback,
    IConsensusOrderedCollectionFactory,
    IConsensusOrderedCollectionEvents,
    IConsensusOrderedCollection,
    ISnapshotable,
    IOrderedCollection,
} from "./interfaces";
export {
    acquireAndComplete,
    waitAcquireAndComplete,
} from "./testUtils";

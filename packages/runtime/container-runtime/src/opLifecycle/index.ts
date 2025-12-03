/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	addBatchMetadata,
	type BatchId,
	BatchManager,
	type BatchSequenceNumbers,
	getEffectiveBatchId,
	generateBatchId,
	type IBatchManagerOptions,
} from "./batchManager.js";
export type {
	LocalBatch,
	LocalBatchMessage,
	LocalEmptyBatchPlaceholder,
	OutboundBatch,
	OutboundBatchMessage,
	OutboundSingletonBatch,
	IBatchCheckpoint,
	IChunkedOp,
} from "./definitions.js";
export { DuplicateBatchDetector } from "./duplicateBatchDetector.js";
export {
	serializeOp,
	ensureContentsDeserialized,
} from "./opSerialization.js";
export {
	type BatchResubmitInfo,
	estimateSocketSize,
	localBatchToOutboundBatch,
	Outbox,
	getLongStack,
} from "./outbox.js";
export { OpCompressor } from "./opCompressor.js";
export { OpDecompressor } from "./opDecompressor.js";
export { OpSplitter, splitOp, isChunkedMessage } from "./opSplitter.js";
export {
	type InboundMessageResult,
	type BatchStartInfo,
	RemoteMessageProcessor,
	unpackRuntimeMessage,
} from "./remoteMessageProcessor.js";
export {
	type EmptyGroupedBatch,
	OpGroupingManager,
	type OpGroupingManagerConfig,
	isGroupedBatch,
} from "./opGroupingManager.js";

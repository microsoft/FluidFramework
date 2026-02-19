/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type BranchId,
	SharedTreeBranch,
	type SharedTreeBranchChange,
	type SharedTreeBranchEvents,
	onForkTransitive,
} from "./branch.js";
export { type ChangeEnricher } from "./changeEnricher.js";
export { DefaultResubmitMachine } from "./defaultResubmitMachine.js";
export {
	EditManager,
	type SharedBranchSummaryData,
	type SummaryData,
	minimumPossibleSequenceNumber,
} from "./editManager.js";
export {
	type EditManagerCodecOptions,
	clientVersionToEditManagerFormatVersion,
	editManagerFormatVersionSelectorForSharedBranches,
	getCodecTreeForEditManagerFormatWithChange,
	makeEditManagerCodec,
} from "./editManagerCodecs.js";
export type {
	Commit,
	EncodedCommit,
	SeqNumber,
	SequencedCommit,
	SummarySessionBranch,
} from "./editManagerFormatCommons.js";
export {
	EditManagerFormatVersion,
	supportedEditManagerFormatVersions,
} from "./editManagerFormatCommons.js";
export { EditManagerSummarizer } from "./editManagerSummarizer.js";
export {
	type MessageEncodingContext,
	clientVersionToMessageFormatVersion,
	getCodecTreeForMessageFormatWithChange,
	makeMessageCodec,
	messageFormatVersionSelectorForSharedBranches,
} from "./messageCodecs.js";
export {
	MessageFormatVersion,
	messageFormatVersions,
	supportedMessageFormatVersions,
} from "./messageFormat.js";
export type { DecodedMessage } from "./messageTypes.js";
export type { ResubmitMachine } from "./resubmitMachine.js";
export {
	type ClonableSchemaAndPolicy,
	type EnrichmentConfig,
	SharedTreeCore,
	type SharedTreeCoreOptionsInternal,
} from "./sharedTreeCore.js";
export {
	type SharedTreeSummarizableMetadata,
	SharedTreeSummaryFormatVersion,
	type Summarizable,
	type SummaryElementParser,
	type SummaryElementStringifier,
	summarizablesMetadataKey,
} from "./summaryTypes.js";
export {
	type OnPop,
	type OnPush,
	SquashingTransactionStack,
	type TransactionEvents,
	TransactionResult,
	TransactionStack,
	type Transactor,
} from "./transaction.js";
export { VersionedSummarizer } from "./versionedSummarizer.js";

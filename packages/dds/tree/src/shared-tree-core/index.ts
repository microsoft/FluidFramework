/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type BranchId,
	onForkTransitive,
	SharedTreeBranch,
	type SharedTreeBranchChange,
	type SharedTreeBranchEvents,
} from "./branch.js";
export {
	type ChangeEnricherMutableCheckout,
	type ChangeEnricherReadonlyCheckout,
	NoOpChangeEnricher,
} from "./changeEnricher.js";
export { DefaultResubmitMachine } from "./defaultResubmitMachine.js";
export {
	EditManager,
	minimumPossibleSequenceNumber,
	type SharedBranchSummaryData,
	type SummaryData,
} from "./editManager.js";
export {
	clientVersionToEditManagerFormatVersion,
	type EditManagerCodecOptions,
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
	clientVersionToMessageFormatVersion,
	getCodecTreeForMessageFormatWithChange,
	messageFormatVersionSelectorForSharedBranches,
} from "./messageCodecs.js";
export {
	MessageFormatVersion,
	messageFormatVersions,
	supportedMessageFormatVersions,
} from "./messageFormat.js";
export type { ResubmitMachine } from "./resubmitMachine.js";
export {
	type ClonableSchemaAndPolicy,
	SharedTreeCore,
	type SharedTreeCoreOptionsInternal,
	type Summarizable,
	type SummaryElementParser,
	type SummaryElementStringifier,
} from "./sharedTreeCore.js";
export {
	type OnPop,
	type OnPush,
	SquashingTransactionStack,
	type TransactionEvents,
	TransactionResult,
	TransactionStack,
	type Transactor,
} from "./transaction.js";

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	onForkTransitive,
	SharedTreeBranch,
	type SharedTreeBranchChange,
	type SharedTreeBranchEvents,
	type BranchId,
} from "./branch.js";

export {
	TransactionResult,
	type Transactor,
	type TransactionEvents,
	TransactionStack,
	SquashingTransactionStack,
	type OnPush,
	type OnPop,
} from "./transaction.js";

export {
	SharedTreeCore,
	type Summarizable,
	type SummaryElementParser,
	type SummaryElementStringifier,
	type ClonableSchemaAndPolicy,
	type SharedTreeCoreOptionsInternal,
} from "./sharedTreeCore.js";

export type { ResubmitMachine } from "./resubmitMachine.js";
export { DefaultResubmitMachine } from "./defaultResubmitMachine.js";

export {
	type ChangeEnricherReadonlyCheckout,
	type ChangeEnricherMutableCheckout,
	NoOpChangeEnricher,
} from "./changeEnricher.js";

export {
	makeEditManagerCodec,
	getCodecTreeForEditManagerFormatWithChange,
	type EditManagerCodecOptions,
	clientVersionToEditManagerFormatVersion,
	editManagerFormatVersionSelectorForSharedBranches,
} from "./editManagerCodecs.js";
export {
	EditManagerFormatVersion,
	supportedEditManagerFormatVersions,
} from "./editManagerFormatCommons.js";
export { EditManagerSummarizer } from "./editManagerSummarizer.js";
export {
	EditManager,
	minimumPossibleSequenceNumber,
	type SummaryData,
	type SharedBranchSummaryData,
} from "./editManager.js";
export type {
	Commit,
	SeqNumber,
	SequencedCommit,
	SummarySessionBranch,
	EncodedCommit,
} from "./editManagerFormatCommons.js";

export {
	getCodecTreeForMessageFormatWithChange,
	clientVersionToMessageFormatVersion,
	messageFormatVersionSelectorForSharedBranches,
} from "./messageCodecs.js";
export {
	MessageFormatVersion,
	messageFormatVersions,
	supportedMessageFormatVersions,
} from "./messageFormat.js";

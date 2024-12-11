/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	onForkTransitive,
	SharedTreeBranch,
	type SharedTreeBranchChange,
	type SharedTreeBranchEvents,
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
	type ExplicitCoreCodecVersions,
	SharedTreeCore,
	type Summarizable,
	type SummaryElementParser,
	type SummaryElementStringifier,
} from "./sharedTreeCore.js";

export type { ResubmitMachine } from "./resubmitMachine.js";
export { DefaultResubmitMachine } from "./defaultResubmitMachine.js";

export {
	type ChangeEnricherReadonlyCheckout,
	type ChangeEnricherMutableCheckout,
	NoOpChangeEnricher,
} from "./changeEnricher.js";

export { makeEditManagerCodec } from "./editManagerCodecs.js";
export { EditManagerSummarizer } from "./editManagerSummarizer.js";
export {
	EditManager,
	minimumPossibleSequenceNumber,
	type SummaryData,
} from "./editManager.js";
export type {
	Commit,
	SeqNumber,
	SequencedCommit,
	SummarySessionBranch,
	EncodedCommit,
} from "./editManagerFormat.js";

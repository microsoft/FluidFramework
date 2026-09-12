/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Configuration for a branch.
 * This has important performance and functional implications.
 *
 * See {@link SAMPLE_BRANCH_CONFIGS} for some example configurations you may wish to use.
 */
export interface SharedBranchConfig {
	/**
	 * Controls when to retain the commit history that relates the tip of the parent branch to the tip of this child branch.
	 * Retaining this history allows the child branch to be rebased onto or merged into the parent branch.
	 * This history grows as new commits are added to either the parent branch or child branch.
	 * This growth negatively impacts the following areas:
	 * - The main memory on running clients that have checked out the child branch
	 * - The size of summaries (in memory and over the wire) and the time required to generate, upload, download, and process them.
	 * - The size of the document at rest (in storage and on the wire).
	 *
	 * @remarks This configuration does not affect the retention of commits necessary for the purpose of merging concurrent edits made to the child branch.
	 */
	readonly retainRelationToParent: HistoryRetentionConfig;

	/**
	 * The maximum number of divergent commits on the parent branch before the child branch is automatically rebased to the tip of the parent branch.
	 * Note that once the rebase occurs, the number of divergent commits on the parent branch comes back down to zero.
	 *
	 * Setting this field to `Number.POSITIVE_INFINITY` disables automatic rebasing entirely.
	 *
	 * Setting this field to `0` will cause the child branch to be automatically rebased onto the parent branch after every new commit on the parent branch.
	 *
	 * Considering the following example graph:
	 * ```text
	 * A──B──C──D──E     <- The tip of the parent branch points to commit `E`
	 *       └──X──Y──Z  <- The tip of the child branch points to commit `Z`
	 * ```
	 * Setting this field to `2` will cause the child branch to be automatically rebased onto the parent branch after the next commit is added to the parent branch.
	 *
	 * @remarks Note that auto-rebasing will only occur if the history linking the tip of both branches happens to be retained at that point in time.
	 * Most notably, auto-rebasing can never occur if {@link HistoryRetentionConfig.untilDivergentCommitCountOnParentBranchExceeds} is configured with a smaller value than the one in this field.
	 * See {@link HistoryRetentionConfig} for more information on how to configure history retention.
	 */
	readonly autoRebaseWhenDivergentCommitCountOnParentBranchExceeds: number;

	/**
	 * The maximum number of commits between the tip of the main branch and the tip of this branch before the tip state of this branch is included in summaries.
	 *
	 * Considering the following example graph:
	 * ```text
	 * A──B──C──D──E           <- The tip of the main branch points to commit `E`
	 *       └──R──S──T        <- The tip of a child branch points to commit `T`
	 *             └──X──Y──Z  <- The tip of a grandchild branch points to commit `Z`
	 * ```
	 * The number of commits between the tip of the main branch and the tip of the child branch is 6 (`E`, `D`, `C`, `R`, `S`, `T`).
	 * The number of commits between the tip of the main branch and the tip of the grandchild branch is 8 (`E`, `D`, `C`, `R`, `S`, `X`, `Y`, `Z`).
	 *
	 * When the tip state is NOT included in summaries,
	 * checking out the branch requires deriving its tip state based on the commit history relating the tip of the branch to the tip of the currently checked-out branch.
	 * (or the tip of the main branch if checking out the branch from scratch).
	 * This computation gets more expensive as the history linking both branches gets longer.
	 * The purpose of summarizing the tip state of a branch is to allow clients to check out the branch without having to derive it based on history.
	 * The cost of summarizing the tip state negatively impacts the following areas:
	 * - The main memory on running clients that have NOT checked out the branch
	 * (clients that have checked out the branch will have to keep the tip state in memory regardless of whether it is summarized or not).
	 * - The size of summaries (in memory and on the wire) and the time required to generate, upload, download, and process them.
	 * - The size of the document at rest (in storage and over the wire).
	 *
	 * Setting this field to `0` will cause the tip state to always be summarized.
	 * This is preferable for applications that require faster checkouts of branches at the cost of increased memory usage and larger summaries,
	 * or for branches that are expected to significantly diverge from the main branch and therefore have a long history linking them to the main branch.
	 *
	 * Setting this field to `Number.POSITIVE_INFINITY` disables tip state summarization *so long as the tip state is reachable through the commit history*.
	 * If the tip state becomes unreachable through the commit history, it will be summarized regardless of this field's value.
	 */
	readonly summarizeTipStateWhenCommitCountToMainTipExceeds: number;
}

/**
 * Controls when to retain the commit history that relates the tip of a parent branch to the tip of a child branch.
 */
export interface HistoryRetentionConfig {
	/**
	 * The maximum number of divergent commits on the parent branch before the history linking both branches is no longer retained.
	 *
	 * Note that the number of divergent commits on the parent branch never exceeds {@link SharedBranchConfig.autoRebaseWhenDivergentCommitCountOnParentBranchExceeds | autoRebaseWhenDivergentCommitCountOnParentBranchExceeds},
	 * setting this field to a value greater than {@link SharedBranchConfig.autoRebaseWhenDivergentCommitCountOnParentBranchExceeds | autoRebaseWhenDivergentCommitCountOnParentBranchExceeds}
	 * is therefore no different from setting it to that value.
	 *
	 * Setting this field to `Number.POSITIVE_INFINITY` will be treated as unbounded,
	 * meaning the history linking both branches is retained no matter how many divergent commits there are on the parent branch.
	 * This can lead to unbounded linear memory growth if {@link SharedBranchConfig.autoRebaseWhenDivergentCommitCountOnParentBranchExceeds} is also unbounded.
	 *
	 * Setting this field to `0` will cause the history to be GC-able as soon as the parent branch diverges from the child branch.
	 *
	 * Considering the following example graph:
	 * ```text
	 * A──B──C──D──E     <- The tip of the parent branch points to commit `E`
	 *       └──X──Y──Z  <- The tip of the child branch points to commit `Z`
	 * ```
	 * This field would have to be set to at least `2` in order to retain the history linking both branches, since there are two divergent commits on the parent branch (`D` and `E`).
	 * Setting it to `1` would cause the whole history to become GC-able as soon as `E` had been added to the parent branch.
	 */
	readonly untilDivergentCommitCountOnParentBranchExceeds: number;
	/**
	 * The maximum number of divergent commits on the child branch before the history linking both branches is no longer retained.
	 *
	 * Setting this field to `Number.POSITIVE_INFINITY` will be treated as unbounded,
	 * meaning the history linking both branches is retained no matter how many divergent commits there are on the child branch.
	 * This can lead to unbounded linear memory growth.
	 *
	 * Setting this field to `0` will cause the history to be GC-able as soon as the child branch diverges from the parent branch.
	 *
	 * Considering the following example graph:
	 * ```text
	 * A──B──C──D──E     <- The tip of the parent branch points to commit `E`
	 *       └──X──Y──Z  <- The tip of the child branch points to commit `Z`
	 * ```
	 * This field would have to be set to at least `3` in order to retain the history linking both branches, since there are three divergent commits on the child branch (`X`, `Y`, and `Z`).
	 * Setting it to `2` would cause the whole history to become GC-able as soon as `Z` had been added to the child branch.
	 */
	readonly untilDivergentCommitCountOnChildBranchExceeds: number;
}

/**
 * This configuration is suitable for a branch whose sole purpose is to keep up with and be merged as soon as possible into its parent.
 * A potential application for this configuration is to provide end users with a persisted staging environment
 * that is always up-to-date with the latest changes on the parent branch but doesn't push its own changes back to the parent branch
 * until the user is ready to do so via merge.
 *
 * The number of divergent commits on the branch is expected to remain small
 * and the number of divergent commits on its parent is kept at 0 by auto-rebasing.
 * This makes summarizing the tip state of the branch unnecessary and of little value.
 */
const errandBranchConfig: SharedBranchConfig = {
	retainRelationToParent: {
		untilDivergentCommitCountOnParentBranchExceeds: 0,
		untilDivergentCommitCountOnChildBranchExceeds: Number.POSITIVE_INFINITY,
	},
	autoRebaseWhenDivergentCommitCountOnParentBranchExceeds: 0,
	summarizeTipStateWhenCommitCountToMainTipExceeds: Number.POSITIVE_INFINITY,
};

/**
 * This configuration is suitable for a branch whose purpose is to stand on its own, independent of its parent branch,
 * with no plan to rebase over its parent or merge back into it (at least via history-based merge).
 * A potential application for this configuration is to provide end users with a way to save a snapshot of the document at a point in time
 * and potentially explore a different direction from that point in time without affecting the main branch.
 * Such an exploration may then be abandoned, kept for future reference, or incorporated into the main branch via a content-based merge.
 *
 * The number of divergent commits on the branch or its parent branch may grow large,
 * so the history linking both branches is not retained and the tip state of the branch is always summarized.
 */
const errantBranchConfig: SharedBranchConfig = {
	retainRelationToParent: {
		untilDivergentCommitCountOnParentBranchExceeds: 0,
		untilDivergentCommitCountOnChildBranchExceeds: 0,
	},
	autoRebaseWhenDivergentCommitCountOnParentBranchExceeds: Number.POSITIVE_INFINITY,
	summarizeTipStateWhenCommitCountToMainTipExceeds: 0,
};

/**
 * This configuration is similar to the errant option
 * but retains the history linking the branch to its parent for a while and summarizes the tip state of the branch only after it has significantly diverged from the main branch.
 * This configuration is suitable for a branch whose purpose is not clear at the outset.
 */
const undecidedBranchConfig: SharedBranchConfig = {
	retainRelationToParent: {
		untilDivergentCommitCountOnParentBranchExceeds: 200,
		untilDivergentCommitCountOnChildBranchExceeds: 200,
	},
	autoRebaseWhenDivergentCommitCountOnParentBranchExceeds: Number.POSITIVE_INFINITY,
	summarizeTipStateWhenCommitCountToMainTipExceeds: 100,
};

/**
 * A set of sample shared branch configurations.
 *
 * These configurations may not be optimal for any particular application.
 * Their purpose is to illustrate how shared branches may be leveraged for different purposes,
 * and to demonstrate how a branch's purpose can be translated into configuration choices.
 */
export const SAMPLE_BRANCH_CONFIGS: {
	/** {@inheritdoc errandBranchConfig} */
	readonly errand: SharedBranchConfig;
	/** {@inheritdoc errantBranchConfig} */
	readonly errant: SharedBranchConfig;
	/** {@inheritdoc undecidedBranchConfig} */
	readonly undecided: SharedBranchConfig;
} = {
	errand: errandBranchConfig,
	errant: errantBranchConfig,
	undecided: undecidedBranchConfig,
};

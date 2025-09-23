/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";
import { createEmitter } from "@fluid-internal/client-utils";
import type { SessionId } from "@fluidframework/id-compressor";
import { BTree } from "@tylerbu/sorted-btree-es6";

import {
	type ChangeFamily,
	type ChangeFamilyEditor,
	type GraphCommit,
	type RevisionTag,
	findAncestor,
	findCommonAncestor,
	mintCommit,
	type RebaseStatsWithDuration,
	tagChange,
} from "../core/index.js";
import { type Mutable, brand, getOrCreate, mapIterable } from "../util/index.js";

import {
	SharedTreeBranch,
	type BranchTrimmingEvents,
	onForkTransitive,
	type BranchId,
} from "./branch.js";
import type {
	Commit,
	SeqNumber,
	SequenceId,
	SequencedCommit,
	SummarySessionBranch,
} from "./editManagerFormatCommons.js";
import {
	getUpperBoundOfPreviousSequenceId,
	equalSequenceIds,
	maxSequenceId,
	minSequenceId,
	sequenceIdComparator,
} from "./sequenceIdUtils.js";
import {
	TelemetryEventBatcher,
	type ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";
import type { Listenable } from "@fluidframework/core-interfaces";

export const minimumPossibleSequenceNumber: SeqNumber = brand(Number.MIN_SAFE_INTEGER);
const minimumPossibleSequenceId: SequenceId = {
	sequenceNumber: minimumPossibleSequenceNumber,
};

/**
 * A special revision tag for the initial {@link EditManager.trunkBase} commit.
 * @remarks This tag is used to supply the _initial_ trunk base with a known revision.
 * The trunk base may advance over time, after which point the trunk base will have a different revision.
 * When {@link EditManager.getSummaryData | serializing} and deserializing, peer branches that include the trunk base commit in their history will always use this tag.
 */
const rootRevision = "root" as const satisfies RevisionTag;

/**
 * Max number of telemetry log call that may be aggregated before being sent.
 */
const maxRebaseStatsAggregationCount = 1000;

/**
 * Represents a local branch of a document and interprets the effect on the document of adding sequenced changes,
 * which were based on a given session's branch, to the document history
 */
// TODO: Try to reduce this to a single type parameter
export class EditManager<
	TEditor extends ChangeFamilyEditor,
	TChangeset,
	TChangeFamily extends ChangeFamily<TEditor, TChangeset>,
> {
	private readonly _events = createEmitter<BranchTrimmingEvents>();

	private readonly sharedBranches = new Map<BranchId, SharedBranch<TEditor, TChangeset>>();

	/**
	 * Tracks where on the trunk of the main branch all registered branches are based.
	 * Each key is the sequence id of a commit on the trunk,
	 * and the value is the set of all branches who have that commit as their common ancestor with the trunk.
	 *
	 * @remarks
	 * This does not include the local branch.
	 */
	private readonly trunkBranches = new BTree<
		SequenceId,
		Set<SharedTreeBranch<TEditor, TChangeset>>
	>(undefined, sequenceIdComparator);

	/**
	 * The sequence number of the newest commit on the trunk that has been received by all peers.
	 * Defaults to {@link minimumPossibleSequenceNumber} if no commits have been received.
	 *
	 * @remarks If there are more than one commit with the same sequence number we assume this refers to the last commit in the batch.
	 */
	private minimumSequenceNumber = minimumPossibleSequenceNumber;

	/**
	 * A special commit that is a "base" (tail) of the trunk, though not part of the trunk itself.
	 * This makes it possible to model the trunk in the same way as any other branch (it branches off of a base commit)
	 * which allows it to use branching APIs to interact with the other branches.
	 * Each time trunk eviction occurs, the most recent evicted commit becomes the new `trunkBase`.
	 */
	private trunkBase: GraphCommit<TChangeset>;

	private readonly telemetryEventBatcher:
		| TelemetryEventBatcher<keyof RebaseStatsWithDuration>
		| undefined;

	/**
	 * @param changeFamily - the change family of changes on the trunk and local branch
	 * @param localSessionId - the id of the local session that will be used for local commits
	 */
	public constructor(
		public readonly changeFamily: TChangeFamily,
		public readonly localSessionId: SessionId,
		private readonly mintRevisionTag: () => RevisionTag,
		logger?: ITelemetryLoggerExt,
	) {
		this.trunkBase = {
			revision: rootRevision,
			change: changeFamily.rebaser.compose([]),
		};

		if (logger !== undefined) {
			this.telemetryEventBatcher = new TelemetryEventBatcher(
				{
					eventName: "rebaseProcessing",
					category: "performance",
				},
				logger,
				maxRebaseStatsAggregationCount,
			);
		}

		const mainTrunk = new SharedTreeBranch(
			this.trunkBase,
			changeFamily,
			mintRevisionTag,
			this._events,
			this.telemetryEventBatcher,
		);

		const mainBranch = this.createSharedBranch("main", undefined, undefined, mainTrunk);

		// Track all forks of the local branch for purposes of trunk eviction. Unlike the local branch, they have
		// an unknown lifetime and rebase frequency, so we can not make any assumptions about which trunk commits
		// they require and therefore we monitor them explicitly.
		onForkTransitive(mainBranch.localBranch, (fork) => this.registerBranch(fork));
	}

	public getLocalBranch(branchId: BranchId): SharedTreeBranch<TEditor, TChangeset> {
		return this.getSharedBranch(branchId).localBranch;
	}

	private getSharedBranch(branchId: BranchId): SharedBranch<TEditor, TChangeset> {
		return this.sharedBranches.get(branchId) ?? fail("Branch does not exist");
	}

	/**
	 * Make the given branch known to the `EditManager`. The `EditManager` will ensure that all registered
	 * branches remain usable even as the minimum sequence number advances.
	 *
	 * TODO#AB6926: Refactor local branch management into a separate class that encapsulates `trunkBranches` and everything
	 * that touches it.
	 * TODO#AB6925: Maintain the divergence point between each branch and the trunk so that we don't have to recompute
	 * it so often.
	 */
	private registerBranch(branch: SharedTreeBranch<TEditor, TChangeset>): void {
		this.trackBranch(branch);
		// Whenever the branch is rebased, update our record of its base trunk commit
		const offBeforeRebase = branch.events.on("beforeChange", (args) => {
			if (args.type === "rebase") {
				this.untrackBranch(branch);
			}
		});
		const offAfterRebase = branch.events.on("afterChange", (args) => {
			if (args.type === "rebase") {
				this.trackBranch(branch);
				this.trimHistory();
			}
		});
		// When the branch is disposed, update our branch set and trim the trunk
		const offDispose = branch.events.on("dispose", () => {
			this.untrackBranch(branch);
			this.trimHistory();
			offBeforeRebase();
			offAfterRebase();
			offDispose();
		});
	}

	private trackBranch(b: SharedTreeBranch<TEditor, TChangeset>): void {
		const main = this.getSharedBranch("main");
		const trunkCommit =
			findCommonAncestor(main.trunk.getHead(), b.getHead()) ??
			fail(0xad2 /* Expected branch to be related to main */);
		const sequenceId = main.getCommitSequenceId(trunkCommit.revision);
		const branches = getOrCreate(this.trunkBranches, sequenceId, () => new Set());

		assert(!branches.has(b), 0x670 /* Branch was registered more than once */);
		branches.add(b);
	}

	private untrackBranch(b: SharedTreeBranch<TEditor, TChangeset>): void {
		const main = this.getSharedBranch("main");
		const trunkCommit =
			findCommonAncestor(main.trunk.getHead(), b.getHead()) ??
			fail(0xad3 /* Expected branch to be related to main */);
		const sequenceId = main.getCommitSequenceId(trunkCommit.revision);
		const branches =
			this.trunkBranches.get(sequenceId) ?? fail(0xad4 /* Expected branch to be tracked */);

		assert(branches.delete(b), 0x671 /* Expected branch to be tracked */);
		if (branches.size === 0) {
			this.trunkBranches.delete(sequenceId);
		}
	}

	/**
	 * Return the sequenced number of the latest sequenced change.
	 */
	public getLatestSequenceNumber(): SeqNumber | undefined {
		let maxSequenceNumber: SeqNumber | undefined;
		for (const branch of this.sharedBranches.values()) {
			const branchMax = branch.getCommitSequenceId(
				branch.trunk.getHead().revision,
			).sequenceNumber;
			if (maxSequenceNumber === undefined || maxSequenceNumber < branchMax) {
				maxSequenceNumber = branchMax;
			}
		}

		return maxSequenceNumber;
	}

	/**
	 * Advances the minimum sequence number, and removes all commits from the trunk which lie outside the collaboration window,
	 * if they are not retained by revertibles or local branches.
	 * @param minimumSequenceNumber - the sequence number of the newest commit that all peers (including this one) have received and applied to their trunks.
	 *
	 * @remarks If there are more than one commit with the same sequence number we assume this refers to the last commit in the batch.
	 */
	public advanceMinimumSequenceNumber(
		minimumSequenceNumber: SeqNumber,
		trimHistory = true,
	): void {
		if (minimumSequenceNumber === this.minimumSequenceNumber) {
			return;
		}

		assert(
			minimumSequenceNumber > this.minimumSequenceNumber,
			0x476 /* number must be larger or equal to current minimumSequenceNumber. */,
		);

		this.minimumSequenceNumber = minimumSequenceNumber;
		if (trimHistory) {
			this.trimHistory();
		}
	}

	/**
	 * Examines the latest known minimum sequence number and the trunk bases of any registered branches to determine
	 * if any commits on the trunk are unreferenced and unneeded for future computation; those found are evicted from the trunk.
	 */
	private trimHistory(): void {
		/** The sequence id of the most recent commit on the trunk that will be trimmed */
		let trunkTailSequenceId: SequenceId = {
			sequenceNumber: this.minimumSequenceNumber,
			indexInBatch: Number.POSITIVE_INFINITY,
		};
		// If there are any outstanding registered branches, get the one that is the oldest (has the "most behind" trunk base)
		const minimumBranchBaseSequenceId = this.trunkBranches.minKey();
		if (minimumBranchBaseSequenceId !== undefined) {
			// If that branch is behind the minimum sequence id, we only want to evict commits older than it,
			// even if those commits are behind the minimum sequence id
			const sequenceIdBeforeMinimumBranchBase = getUpperBoundOfPreviousSequenceId(
				minimumBranchBaseSequenceId,
			);
			trunkTailSequenceId = minSequenceId(
				trunkTailSequenceId,
				sequenceIdBeforeMinimumBranchBase,
			);
		}

		const mainBranch = this.getSharedBranch("main");

		const [sequenceId, latestEvicted] = mainBranch.getClosestTrunkCommit(
			maxSequenceId(
				trunkTailSequenceId,
				mainBranch.sequenceIdToCommit.minKey() ?? minimumPossibleSequenceId,
			),
		);

		// Don't do any work if the commit found by the search is already the tail of the trunk
		if (latestEvicted === this.trunkBase) {
			return;
		}

		// This mutation is a performance hack. If commits are truly immutable, then changing the trunk's tail requires
		// regenerating the entire commit graph. Instead, we can simply chop off the tail like this if we're certain
		// that there are no outstanding references to any of the commits being removed (other than the references via
		// the trunk). The peer branches have been rebased to the head of the trunk, the local branch is already rebased
		// to the head of the trunk, and all other branches are tracked by `trunkBranches` and known to be ahead of or at
		// `newTrunkBase`. Therefore, no branches should have unique references to any of the commits being evicted here.
		// We mutate the most recent of the evicted commits to become the new trunk base. That way, any other commits that
		// have parent pointers to the latest evicted commit will stay linked, even though that it is no longer part of the trunk.
		const newTrunkBase = latestEvicted as Mutable<typeof latestEvicted>;

		// collect the revisions that will be trimmed to send as part of the branch trimmed event
		const trimmedCommits = getPathFromBase(newTrunkBase, this.trunkBase);
		const trimmedRevisions = trimmedCommits.map((c) => c.revision);

		// The minimum sequence number informs us that all peer branches are at least caught up to the tail commit,
		// so rebase them accordingly. This is necessary to prevent peer branches from referencing any evicted commits.
		mainBranch.trimHistory(latestEvicted, sequenceId);

		// Only the last trimmed commit, which is the new trunk base, should remain accessible.
		for (const commit of trimmedCommits.slice(0, -1)) {
			Reflect.defineProperty(commit, "change", {
				get: () =>
					assert(false, 0xa5e /* Should not access 'change' property of an evicted commit */),
			});
			Reflect.defineProperty(commit, "revision", {
				get: () =>
					assert(
						false,
						0xa5f /* Should not access 'revision' property of an evicted commit */,
					),
			});
			Reflect.defineProperty(commit, "parent", {
				get: () =>
					assert(false, 0xa60 /* Should not access 'parent' property of an evicted commit */),
			});
		}

		// Dropping the parent field removes (transitively) all references to the evicted commits so they can be garbage collected.
		delete newTrunkBase.parent;
		this.trunkBase = newTrunkBase;

		this._events.emit("ancestryTrimmed", trimmedRevisions);
	}

	public isEmpty(): boolean {
		for (const branch of this.sharedBranches.values()) {
			if (!branch.isEmpty(this.trunkBase)) {
				return false;
			}
		}

		return this.minimumSequenceNumber === minimumPossibleSequenceNumber;
	}

	public getSummaryData(): SummaryData<TChangeset> {
		// Trimming the trunk before serializing ensures that the trunk data in the summary is as minimal as possible.
		this.trimHistory();

		const minSeqNumberToSummarize: SequenceId = {
			sequenceNumber: brand(this.minimumSequenceNumber + 1),
		};
		let minBaseSeqId: SequenceId = minSeqNumberToSummarize;
		const mainBranch = this.getSharedBranch("main");
		const branches = new Map<BranchId, SharedBranchSummaryData<TChangeset>>();
		for (const [branchId, branch] of this.sharedBranches) {
			if (branchId !== "main") {
				const branchSummary = branch.getSummaryData(
					minSeqNumberToSummarize,
					this.trunkBase.revision,
				);
				branches.set(branchId, branchSummary);
				assert(branchSummary.base !== undefined, "Branch summary must have a base");
				const baseSequenceId = mainBranch.getCommitSequenceId(branchSummary.base);
				minBaseSeqId = minSequenceId(minBaseSeqId, baseSequenceId);
			}
		}
		const mainSummary = mainBranch.getSummaryData(minBaseSeqId, this.trunkBase.revision);
		return { main: mainSummary, branches, originator: this.localSessionId };
	}

	public loadSummaryData(data: SummaryData<TChangeset>): void {
		assert(
			this.isEmpty(),
			0x68a /* Attempted to load from summary after edit manager was already mutated */,
		);
		// Record the tags of each trunk commit as we generate the trunk so they can be looked up quickly
		// when hydrating the peer branches below
		const trunkRevisionCache = new Map<RevisionTag, GraphCommit<TChangeset>>();
		trunkRevisionCache.set(this.trunkBase.revision, this.trunkBase);
		const mainBranch = this.sharedBranches.get("main") ?? fail("Main branch must exist");
		mainBranch.loadSummaryData(data.main, trunkRevisionCache);
		if (data.branches !== undefined) {
			for (const [branchId, branchData] of data.branches) {
				const branch = this.createSharedBranch(
					branchId,
					branchData.session,
					mainBranch,
					mainBranch.trunk.fork(),
				);
				branch.loadSummaryData(branchData, trunkRevisionCache);
			}
		}
	}

	public getTrunkHead(branchId: BranchId): GraphCommit<TChangeset> {
		return this.getSharedBranch(branchId).trunk.getHead();
	}

	public getTrunkChanges(branchId: BranchId): TChangeset[] {
		return this.getTrunkCommits(branchId).map((c) => c.change);
	}

	public getTrunkCommits(branchId: BranchId): GraphCommit<TChangeset>[] {
		return getPathFromBase(this.getTrunkHead(branchId), this.trunkBase);
	}

	public getLocalChanges(branchId: BranchId): readonly TChangeset[] {
		return this.getLocalCommits(branchId).map((c) => c.change);
	}

	public getLocalCommits(branchId: BranchId): readonly GraphCommit<TChangeset>[] {
		const branch = this.getSharedBranch(branchId);
		return branch.getLocalCommits();
	}

	/**
	 * Gets the length of the longest branch maintained by this `EditManager`.
	 * This may be the length of a peer branch or the local branch.
	 *
	 * @remarks
	 * The length is counted from the lowest common ancestor with the trunk such that a fully sequenced branch would
	 * have length zero.
	 */
	public getLongestBranchLength(): number {
		let max = 0;
		for (const branch of this.sharedBranches.values()) {
			max = Math.max(max, branch.getLongestBranchLength());
		}
		return max;
	}

	public sequenceBranchCreation(
		sessionId: SessionId,
		referenceSequenceNumber: SeqNumber,
		branchId: BranchId,
	): void {
		if (sessionId === this.localSessionId) {
			assert(this.sharedBranches.has(branchId), "Expected branch to already exist");
			return;
		}

		const mainBranch = this.getSharedBranch("main");
		const branchTrunk = mainBranch.rebasePeer(sessionId, referenceSequenceNumber).fork();

		const sharedBranch = this.createSharedBranch(branchId, sessionId, mainBranch, branchTrunk);
		this.registerBranch(sharedBranch.localBranch);
		onForkTransitive(sharedBranch.localBranch, (fork) => this.registerBranch(fork));
	}

	public addBranch(branchId: BranchId): void {
		const main = this.getSharedBranch("main") ?? fail("Main branch must exist");
		this.createSharedBranch(
			branchId,
			this.localSessionId,
			main,
			this.getLocalBranch("main").fork(),
		);
	}

	public removeBranch(branchId: BranchId): void {
		assert(branchId !== "main", "Cannot remove main branch");
		const hadBranch = this.sharedBranches.delete(branchId);
		assert(hadBranch, "Expected branch to exist");
	}

	private createSharedBranch(
		branchId: BranchId,
		sessionId: SessionId | undefined,
		parent: SharedBranch<TEditor, TChangeset> | undefined,
		branch: SharedTreeBranch<TEditor, TChangeset>,
	): SharedBranch<TEditor, TChangeset> {
		const sharedBranch = new SharedBranch(
			parent,
			branch,
			branchId,
			sessionId,
			minimumPossibleSequenceId,
			this.changeFamily,
			this.mintRevisionTag,
			this._events,
			this.telemetryEventBatcher,
		);

		assert(!this.sharedBranches.has(branchId), "A branch with this ID already exists");
		this.sharedBranches.set(branchId, sharedBranch);
		return sharedBranch;
	}

	/* eslint-disable jsdoc/check-indentation */
	/**
	 * Add a bunch of sequenced changes. A bunch is a group of sequenced commits that have the following properties:
	 * - They are not interleaved with messages from other DDSes in the container.
	 * - They are all part of the same batch, which entails:
	 *   - They are contiguous in sequencing order.
	 *   - They are all from the same client.
	 *   - They are all based on the same reference sequence number.
	 *   - They are not interleaved with messages from other clients.
	 */
	/* eslint-enable jsdoc/check-indentation */
	public addSequencedChanges(
		newCommits: readonly GraphCommit<TChangeset>[],
		sessionId: SessionId,
		sequenceNumber: SeqNumber,
		referenceSequenceNumber: SeqNumber,
		branchId: BranchId = "main",
	): void {
		assert(newCommits.length > 0, 0xad8 /* Expected at least one sequenced change */);
		assert(
			sequenceNumber > this.minimumSequenceNumber,
			0x713 /* Expected change sequence number to exceed the last known minimum sequence number */,
		);

		const branch = this.getSharedBranch(branchId);

		const onSequenceLocalCommit = (
			commit: GraphCommit<TChangeset>,
			sequenceId: SequenceId,
			previousSequenceId: SequenceId,
		): void => {
			// Next, we need to update the sequence IDs that our local branches (user's branches, not peer branches) are associated with.
			// In particular, if a local branch is based on the previous trunk head (the branch's first ancestor in the trunk is the commit that was the head before we pushed the new commit)
			// and also branches off of the local branch (it has an ancestor that is part of the local branch), it needs to have its sequence number advanced to be that of the new trunk head.
			// Intuitively, this makes sense because:
			// 1. The trunk's head just advanced forward by some (sequence) amount.
			// 2. The local branch is always rebased to be branching off of the head of the trunk (not literally in this case, because of the optimization, but in effect).
			// 3. Therefore, the entire local branch just advanced forward by some (sequence) amount, and any commits downstream of it which track the sequence numbers of their base commits on the trunk should also advance.
			// This update is not necessarily required for all local branches, since some may have fallen behind the local branch and are based on older trunk commits (such branches do not need updating).
			const currentBranches = this.trunkBranches.get(previousSequenceId);
			if (currentBranches !== undefined) {
				const newBranches = getOrCreate(this.trunkBranches, sequenceId, () => new Set());
				for (const forkedBranch of currentBranches) {
					// Check every branch associated with the old sequence ID and advance it if it is based on the local branch (specifically, on the local branch as it was before we pushed its first commit to the trunk).
					// We validate this by checking if the branch's head is a descendant of the local commit that we just pushed.
					if (findAncestor(forkedBranch.getHead(), (c) => c === commit) !== undefined) {
						newBranches.add(forkedBranch);
						currentBranches.delete(forkedBranch);
					}
				}
				// Clean up our trunk branches map by removing any empty sets.
				if (currentBranches.size === 0) {
					this.trunkBranches.delete(previousSequenceId);
				}
				if (newBranches.size === 0) {
					this.trunkBranches.delete(sequenceId);
				}
			}
		};

		const areLocalCommits = sessionId === this.localSessionId;
		branch.addSequencedChanges(
			newCommits,
			sessionId,
			sequenceNumber,
			areLocalCommits,
			referenceSequenceNumber,
			onSequenceLocalCommit,
		);
	}

	public findLocalCommit(
		branchId: BranchId,
		revision: RevisionTag,
	): [commit: GraphCommit<TChangeset>, commitsAfter: GraphCommit<TChangeset>[]] {
		const commits: GraphCommit<TChangeset>[] = [];
		const commit = findAncestor(
			[this.getSharedBranch(branchId).localBranch.getHead(), commits],
			(c) => c.revision === revision,
		);
		assert(commit !== undefined, 0x599 /* Expected local branch to contain revision */);
		return [commit, commits];
	}
}

/**
 * The in-memory data that summaries contain
 */
export interface SummaryData<TChangeset> {
	readonly originator?: SessionId;
	readonly main: SharedBranchSummaryData<TChangeset>;
	readonly branches?: ReadonlyMap<BranchId, SharedBranchSummaryData<TChangeset>>;
}

export interface SharedBranchSummaryData<TChangeset> {
	readonly id?: BranchId;
	readonly name?: string;
	readonly session?: SessionId;
	readonly author?: string;
	readonly base?: RevisionTag;
	readonly trunk: readonly SequencedCommit<TChangeset>[];
	readonly peerLocalBranches: ReadonlyMap<SessionId, SummarySessionBranch<TChangeset>>;
}

/**
 * Gets the path from the base of a branch to its head.
 */
function getPathFromBase<TCommit extends { parent?: TCommit }>(
	branchHead: TCommit,
	baseBranchHead: TCommit,
): TCommit[] {
	const path: TCommit[] = [];
	assert(
		findCommonAncestor([branchHead, path], baseBranchHead) !== undefined,
		0x573 /* Expected branches to be related */,
	);
	return path;
}

class SharedBranch<TEditor extends ChangeFamilyEditor, TChangeset> {
	/**
	 * This branch holds the changes made by this client which have not yet been confirmed as sequenced changes.
	 */
	public readonly localBranch: SharedTreeBranch<TEditor, TChangeset>;

	/**
	 * Branches are maintained to represent the local change list that the issuing client had
	 * at the time of submitting the latest known edit on the branch.
	 * This means the head commit of each branch is always in its original (non-rebased) form.
	 */
	private readonly peerLocalBranches: Map<SessionId, SharedTreeBranch<TEditor, TChangeset>> =
		new Map();

	/**
	 * A map from a sequence id to the commit which has that sequence id.
	 * This also includes an entry for the {@link trunkBase} which always has the lowest key in the map.
	 */
	public readonly sequenceIdToCommit = new BTree<SequenceId, GraphCommit<TChangeset>>(
		undefined,
		sequenceIdComparator,
	);

	/**
	 * The list of commits (from oldest to most recent) that are on the local branch but not on the trunk.
	 * When a local commit is sequenced, the first commit in this list shifted onto the tip of the trunk.
	 */
	private readonly localCommits: GraphCommit<TChangeset>[] = [];

	/**
	 * Records extra data associated with sequenced commits.
	 * This does not include an entry for the {@link trunkBase}.
	 */
	private readonly commitMetadata = new Map<
		RevisionTag,
		{ sequenceId: SequenceId; sessionId: SessionId }
	>();

	public constructor(
		public readonly parentBranch: SharedBranch<TEditor, TChangeset> | undefined,
		public readonly trunk: SharedTreeBranch<TEditor, TChangeset>,
		private readonly id: BranchId,
		private readonly sessionId: SessionId | undefined,
		baseCommitSequenceId: SequenceId,
		private readonly changeFamily: ChangeFamily<TEditor, TChangeset>,
		private readonly mintRevisionTag: () => RevisionTag,
		branchTrimmer: Listenable<BranchTrimmingEvents>,
		telemetryEventBatcher: TelemetryEventBatcher<keyof RebaseStatsWithDuration> | undefined,
	) {
		this.localBranch = new SharedTreeBranch(
			this.trunk.getHead(),
			changeFamily,
			mintRevisionTag,
			branchTrimmer,
			telemetryEventBatcher,
		);

		this.sequenceIdToCommit.set(baseCommitSequenceId, this.trunk.getHead());

		this.localBranch.events.on("afterChange", (event) => {
			if (event.type === "append") {
				for (const commit of event.newCommits) {
					this.localCommits.push(commit);
				}
			} else {
				this.localCommits.length = 0;
				findCommonAncestor(
					[this.localBranch.getHead(), this.localCommits],
					this.trunk.getHead(),
				);
			}
		});
	}

	public addSequencedChanges(
		newCommits: readonly GraphCommit<TChangeset>[],
		sessionId: SessionId,
		sequenceNumber: SeqNumber,
		areLocalCommits: boolean,
		referenceSequenceNumber: SeqNumber,
		onSequenceLocalCommit: OnSequenceCommit<TChangeset>,
	): void {
		assert(
			sequenceNumber >= // This is ">=", not ">" because changes in the same batch will have the same sequence number
				(this.sequenceIdToCommit.maxKey()?.sequenceNumber ?? minimumPossibleSequenceNumber),
			0xa64 /* Attempted to sequence change with an outdated sequence number */,
		);

		const batchSize = this.getBatchSize(sequenceNumber);
		// The sequence id for the next commit to be processed in the bunch.
		let nextSequenceId =
			batchSize === 0
				? {
						sequenceNumber,
					}
				: {
						sequenceNumber,
						indexInBatch: batchSize,
					};

		// Local changes, i.e., changes from this client are applied by fast forwarding the local branch commit onto
		// the trunk.
		if (areLocalCommits) {
			for (const _ of newCommits) {
				this.sequenceLocalCommit(nextSequenceId, sessionId, onSequenceLocalCommit);
				nextSequenceId = getNextSequenceId(nextSequenceId);
			}
			return;
		}

		// Remote changes, i.e., changes from remote clients are applied in three steps.
		// Step 1 - Recreate the peer remote client's local environment.
		// Get the revision that the remote change is based on and rebase that peer local branch over the part of the
		// trunk up to the base revision. This will be a no-op if the sending client has not advanced since the last
		// time we received an edit from it
		const peerLocalBranch = this.rebasePeer(sessionId, referenceSequenceNumber);

		// Step 2 - Append the changes to the peer branch and rebase the changes to the tip of the trunk.
		if (peerLocalBranch.getHead() === this.trunk.getHead()) {
			// If the peer local branch is fully caught up and empty (no changes relative to the trunk) after being
			// rebased, then push changes to the trunk directly and update the peer branch to the trunk's head.
			for (const newCommit of newCommits) {
				this.pushCommitToTrunk(nextSequenceId, { ...newCommit, sessionId });
				nextSequenceId = getNextSequenceId(nextSequenceId);
			}
			peerLocalBranch.setHead(this.trunk.getHead());
		} else {
			// Otherwise, push the changes to the peer local branch and merge the branch into the trunk.
			for (const newCommit of newCommits) {
				peerLocalBranch.apply(tagChange(newCommit.change, newCommit.revision));
			}
			const result = this.trunk.merge(peerLocalBranch);
			if (result !== undefined) {
				// If the merge resulted in any changes to the trunk, update the sequence map and trunk metadata
				// with the rebased commits.
				for (const sourceCommit of result.sourceCommits) {
					this.sequenceIdToCommit.set(nextSequenceId, sourceCommit);
					this.commitMetadata.set(sourceCommit.revision, {
						sequenceId: nextSequenceId,
						sessionId,
					});
					nextSequenceId = getNextSequenceId(nextSequenceId);
				}
			}
		}

		// Step 3 - Rebase the local branch over the updated trunk.
		this.localBranch.rebaseOnto(this.trunk);
	}

	public isEmpty(baseCommit: GraphCommit<TChangeset>): boolean {
		return (
			this.trunk.getHead() === baseCommit &&
			this.peerLocalBranches.size === 0 &&
			this.localBranch.getHead() === this.trunk.getHead()
		);
	}

	public rebasePeer(
		sessionId: SessionId,
		referenceSequenceNumber: SeqNumber,
	): SharedTreeBranch<TEditor, TChangeset> {
		const [, baseRevisionInTrunk] = this.getClosestTrunkCommit(referenceSequenceNumber);
		const peerLocalBranch = getOrCreate(
			this.peerLocalBranches,
			sessionId,
			() => new SharedTreeBranch(baseRevisionInTrunk, this.changeFamily, this.mintRevisionTag),
		);
		peerLocalBranch.rebaseOnto(this.trunk, baseRevisionInTrunk);
		return peerLocalBranch;
	}

	public getPeerBranchOrTrunk(sessionId: SessionId): SharedTreeBranch<TEditor, TChangeset> {
		return this.peerLocalBranches.get(sessionId) ?? this.trunk;
	}

	/**
	 * Gets the length of the longest branch maintained by this `SharedBranch`.
	 * This may be the length of a peer branch or the local branch.
	 *
	 * @remarks
	 * The length is counted from the lowest common ancestor with the trunk such that a fully sequenced branch would
	 * have length zero.
	 */
	public getLongestBranchLength(): number {
		let max = 0;
		const trunkHead = this.trunk.getHead();
		for (const branch of this.peerLocalBranches.values()) {
			const branchPath = getPathFromBase(branch.getHead(), trunkHead);
			if (branchPath.length > max) {
				max = branchPath.length;
			}
		}
		const localPath = getPathFromBase(this.localBranch.getHead(), trunkHead);
		return Math.max(max, localPath.length);
	}

	public trimHistory(newBase: GraphCommit<TChangeset>, sequenceId: SequenceId): void {
		this.rebasePeers(newBase);

		this.sequenceIdToCommit.editRange(
			minimumPossibleSequenceId,
			sequenceId,
			true,
			(s, commit) => {
				// Cleanup look-aside data for each evicted commit
				this.commitMetadata.delete(commit.revision);
				// Delete all evicted commits from `sequenceMap` except for the latest one, which is the new `trunkBase`
				if (equalSequenceIds(s, sequenceId)) {
					assert(
						commit === newBase,
						0x729 /* Expected last evicted commit to be new trunk base */,
					);
				} else {
					return { delete: true };
				}
			},
		);

		const trunkSize = getPathFromBase(this.trunk.getHead(), newBase).length;
		assert(
			this.sequenceIdToCommit.size === trunkSize + 1,
			0x744 /* The size of the sequenceMap must have one element more than the trunk */,
		);
		assert(
			this.commitMetadata.size === trunkSize,
			0x745 /* The size of the trunkMetadata must be the same as the trunk */,
		);
	}

	private rebasePeers(commit: GraphCommit<TChangeset>): void {
		for (const [, branch] of this.peerLocalBranches) {
			branch.rebaseOnto(this.trunk, commit);
		}

		// The metadata for new trunk base revision needs to be deleted before modifying it.
		this.commitMetadata.delete(commit.revision);
	}

	public getLocalCommits(): readonly GraphCommit<TChangeset>[] {
		return this.localCommits;
	}

	/**
	 * Promote the oldest un-sequenced commit on the local branch to the head of the trunk.
	 * @param sequenceId - The sequence id of the new trunk commit
	 * @remarks This method is a performance optimization for the scenario where this client receives its own change back after sequencing.
	 * The normal (not optimized) process in this case would be to apply the new sequenced commit to the trunk and then rebase the local branch over the trunk.
	 * The first commit will be "the same" (as in, it will have the same revision) as the commit that was just sequenced, so the rebase will be a no-op.
	 * Because the rebase is a no-op, we can skip it entirely and simply remove the commit from the local branch and append it to the trunk.
	 * Avoiding the overhead of the rebase process, even when it's a no-op, has real measured performance benefits and is worth the added complexity here.
	 */
	private sequenceLocalCommit(
		sequenceId: SequenceId,
		sessionId: SessionId,
		onSequenceLocalCommit: OnSequenceCommit<TChangeset>,
	): GraphCommit<TChangeset> {
		// First, push the local commit to the trunk.
		// We are mutating our `localCommits` cache here,but there is no need to actually change the `localBranch` itself because it will simply catch up later if/when it next rebases.
		const firstLocalCommit = this.localCommits.shift();
		assert(
			firstLocalCommit !== undefined,
			0x6b5 /* Received a sequenced change from the local session despite having no local changes */,
		);

		const prevSequenceId = this.getCommitSequenceId(this.trunk.getHead().revision);
		this.pushGraphCommitToTrunk(sequenceId, firstLocalCommit, sessionId);
		onSequenceLocalCommit(firstLocalCommit, sequenceId, prevSequenceId);
		return firstLocalCommit;
	}

	/**
	 * Finds the most recent trunk commit that was sequenced at or before the given point.
	 * @param searchBy - the sequence number or the sequence id to search for
	 * @remarks Fails if there is no eligible commit.
	 * @returns the closest commit and its sequence id
	 */
	public getClosestTrunkCommit(searchBy: SeqNumber): [SequenceId, GraphCommit<TChangeset>];
	public getClosestTrunkCommit(searchBy: SequenceId): [SequenceId, GraphCommit<TChangeset>];
	public getClosestTrunkCommit(
		searchBy: SeqNumber | SequenceId,
	): [SequenceId, GraphCommit<TChangeset>] {
		const sequenceId: SequenceId =
			typeof searchBy === "number"
				? {
						// This is to make sure that the correct commit is selected in this 2 scenarios:
						// 1) The commit is unique for that sequence number
						// 2) There are more than one commit for the same sequence number, in this case we need to select the last one.
						sequenceNumber: searchBy,
						indexInBatch: Number.POSITIVE_INFINITY,
					}
				: searchBy;

		const commit = this.sequenceIdToCommit.getPairOrNextLower(sequenceId);
		assert(commit !== undefined, 0x746 /* sequence id has been evicted */);
		return commit;
	}

	private pushGraphCommitToTrunk(
		sequenceId: SequenceId,
		graphCommit: GraphCommit<TChangeset>,
		sessionId: SessionId,
	): void {
		this.trunk.setHead(graphCommit);
		this.registerSequencedCommit(sequenceId, sessionId, graphCommit);
	}

	private pushCommitToTrunk(sequenceId: SequenceId, commit: Commit<TChangeset>): void {
		const mintedCommit = mintCommit(this.trunk.getHead(), commit);
		this.pushGraphCommitToTrunk(sequenceId, mintedCommit, commit.sessionId);
	}

	private registerSequencedCommit(
		sequenceId: SequenceId,
		sessionId: SessionId,
		commit: GraphCommit<TChangeset>,
	): void {
		this.sequenceIdToCommit.set(sequenceId, commit);
		this.commitMetadata.set(commit.revision, { sequenceId, sessionId });
	}

	public getCommitSequenceId(commitRevision: RevisionTag): SequenceId {
		const id = this.commitMetadata.get(commitRevision)?.sequenceId;
		if (id === undefined) {
			return minimumPossibleSequenceId;
		}
		return id;
	}

	// TODO: Document that this is to handle receiving separate commits with the same sequence ID,
	// as a batch of changes are not guaranteed to be processed as one bunch.
	private getBatchSize(sequenceNumber: SeqNumber): number {
		const startSequenceId: SequenceId = {
			sequenceNumber,
		};
		const endSequenceId: SequenceId = {
			sequenceNumber: brand((sequenceNumber as number) + 1),
		};

		return this.sequenceIdToCommit.getRange(startSequenceId, endSequenceId, false).length;
	}

	public getSummaryData(
		minSeqNumberToSummarize: SequenceId,
		trunkBaseRevision: RevisionTag,
	): SharedBranchSummaryData<TChangeset> {
		// The assert below is acceptable at present because summarization only ever occurs on a client with no
		// local/in-flight changes.
		// In the future we may wish to relax this constraint. For that to work, the current implementation of
		// `EditManager` would have to be amended in one of two ways:
		// A) Changes made by the local session should be represented by a branch in `EditManager.branches`.
		// B) The contents of such a branch should be computed on demand based on the trunk.
		// Note that option (A) would be a simple change to `addSequencedChanges` whereas (B) would likely require
		// rebasing trunk changes over the inverse of trunk changes.
		assert(
			this.localBranch.getHead() === this.trunk.getHead(),
			"Clients with local changes cannot be used to generate summaries",
		);

		let parentHead: GraphCommit<TChangeset>;
		if (this.parentBranch === undefined) {
			const oldestCommitInCollabWindow =
				this.getClosestTrunkCommit(minSeqNumberToSummarize)[1];
			// Path construction is exclusive, so we need to use the parent of the oldest commit in the window if it exists
			parentHead = oldestCommitInCollabWindow.parent ?? oldestCommitInCollabWindow;
		} else {
			parentHead = this.parentBranch.trunk.getHead();
		}

		const childBranchTrunkCommits: GraphCommit<TChangeset>[] = [];
		const forkPointFromMainTrunk = findCommonAncestor(
			[this.trunk.getHead(), childBranchTrunkCommits],
			parentHead,
		);
		assert(
			forkPointFromMainTrunk !== undefined,
			"Expected child branch to be based on main branch",
		);

		const trunk = childBranchTrunkCommits.map((c) => {
			const metadata =
				this.commitMetadata.get(c.revision) ??
				fail(0xad5 /* Expected metadata for trunk commit */);
			const commit: SequencedCommit<TChangeset> = {
				change: c.change,
				revision: c.revision,
				sequenceNumber: metadata.sequenceId.sequenceNumber,
				sessionId: metadata.sessionId,
			};
			if (metadata.sequenceId.indexInBatch !== undefined) {
				commit.indexInBatch = metadata.sequenceId.indexInBatch;
			}
			return commit;
		});

		const peerLocalBranches = new Map<SessionId, SummarySessionBranch<TChangeset>>(
			mapIterable(this.peerLocalBranches.entries(), ([sessionId, branch]) => {
				const branchPath: GraphCommit<TChangeset>[] = [];
				const ancestor =
					findCommonAncestor([branch.getHead(), branchPath], this.trunk.getHead()) ??
					fail(0xad6 /* Expected branch to be based on trunk */);

				const base =
					ancestor.revision === trunkBaseRevision ? rootRevision : ancestor.revision;
				return [
					sessionId,
					{
						base,
						commits: branchPath.map((c) => {
							const commit: Commit<TChangeset> = {
								change: c.change,
								revision: c.revision,
								sessionId,
							};
							return commit;
						}),
					},
				];
			}),
		);

		const trunkBase =
			this.parentBranch === undefined ? undefined : forkPointFromMainTrunk.revision;
		return { trunk, peerLocalBranches, base: trunkBase, id: this.id, session: this.sessionId };
	}

	public loadSummaryData(
		data: SharedBranchSummaryData<TChangeset>,
		trunkRevisionCache: Map<RevisionTag, GraphCommit<TChangeset>>,
	): void {
		assert(
			(this.parentBranch === undefined) === (data.base === undefined),
			"Expected branch base to match presence of parent branch",
		);
		const parentTrunkBase =
			trunkRevisionCache.get(data.base ?? rootRevision) ??
			fail("Expected base revision to be in trunk cache");
		this.trunk.setHead(
			data.trunk.reduce((base, c) => {
				const sequenceId: SequenceId =
					c.indexInBatch === undefined
						? {
								sequenceNumber: c.sequenceNumber,
							}
						: {
								sequenceNumber: c.sequenceNumber,
								indexInBatch: c.indexInBatch,
							};
				const commit = mintCommit(base, c);
				this.sequenceIdToCommit.set(sequenceId, commit);
				this.commitMetadata.set(c.revision, {
					sequenceId,
					sessionId: c.sessionId,
				});
				trunkRevisionCache.set(c.revision, commit);
				return commit;
			}, parentTrunkBase),
		);

		this.localBranch.setHead(this.trunk.getHead());

		for (const [sessionId, branch] of data.peerLocalBranches) {
			const commit =
				trunkRevisionCache.get(branch.base) ??
				fail(0xad7 /* Expected summary branch to be based off of a revision in the trunk */);

			this.peerLocalBranches.set(
				sessionId,
				new SharedTreeBranch(
					branch.commits.reduce(mintCommit, commit),
					this.changeFamily,
					this.mintRevisionTag,
				),
			);
		}
	}
}

// Returns the sequence id for the next commit to be processed in the bunch. Since all the commits have the
// same sequence number, only the index in the batch needs to be incremented.
function getNextSequenceId(sequenceId: SequenceId): SequenceId {
	return {
		sequenceNumber: sequenceId.sequenceNumber,
		indexInBatch: (sequenceId.indexInBatch ?? 0) + 1,
	};
}

type OnSequenceCommit<TChangeset> = (
	commit: GraphCommit<TChangeset>,
	sequenceId: SequenceId,
	prevSequenceId: SequenceId,
) => void;

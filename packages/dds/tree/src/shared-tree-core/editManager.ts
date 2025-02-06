/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
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
	rebaseChange,
	type RebaseStatsWithDuration,
	tagChange,
} from "../core/index.js";
import { type Mutable, brand, fail, getOrCreate, mapIterable } from "../util/index.js";

import { SharedTreeBranch, type BranchTrimmingEvents, onForkTransitive } from "./branch.js";
import type {
	Commit,
	SeqNumber,
	SequenceId,
	SequencedCommit,
	SummarySessionBranch,
} from "./editManagerFormat.js";
import {
	getUpperBoundOfPreviousSequenceId,
	equalSequenceIds,
	maxSequenceId,
	minSequenceId,
	sequenceIdComparator,
} from "./sequenceIdUtils.js";
import {
	TelemetryEventBatcher,
	measure,
	type ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

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

	/** The "trunk" branch. The trunk represents the list of received sequenced changes. */
	private readonly trunk: SharedTreeBranch<TEditor, TChangeset>;

	/**
	 * Records extra data associated with commits in the {@link trunk}.
	 * This does not include an entry for the {@link trunkBase}.
	 */
	private readonly trunkMetadata = new Map<
		RevisionTag,
		{ sequenceId: SequenceId; sessionId: SessionId }
	>();
	/**
	 * A map from a sequence id to the commit in the {@link trunk} which has that sequence id.
	 * This also includes an entry for the {@link trunkBase} which always has the lowest key in the map.
	 */
	private readonly sequenceMap = new BTree<SequenceId, GraphCommit<TChangeset>>(
		undefined,
		sequenceIdComparator,
	);

	/**
	 * Branches are maintained to represent the local change list that the issuing client had
	 * at the time of submitting the latest known edit on the branch.
	 * This means the head commit of each branch is always in its original (non-rebased) form.
	 */
	private readonly peerLocalBranches: Map<SessionId, SharedTreeBranch<TEditor, TChangeset>> =
		new Map();

	/**
	 * This branch holds the changes made by this client which have not yet been confirmed as sequenced changes.
	 */
	public readonly localBranch: SharedTreeBranch<TEditor, TChangeset>;

	/**
	 * Tracks where on the trunk all registered branches are based. Each key is the sequence id of a commit on
	 * the trunk, and the value is the set of all branches who have that commit as their common ancestor with the trunk.
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

	/**
	 * The list of commits (from oldest to most recent) that are on the local branch but not on the trunk.
	 * When a local commit is sequenced, the first commit in this list shifted onto the tip of the trunk.
	 */
	private readonly localCommits: GraphCommit<TChangeset>[] = [];

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
		this.sequenceMap.set(minimumPossibleSequenceId, this.trunkBase);

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

		this.trunk = new SharedTreeBranch(
			this.trunkBase,
			changeFamily,
			mintRevisionTag,
			this._events,
			this.telemetryEventBatcher,
		);
		this.localBranch = new SharedTreeBranch(
			this.trunk.getHead(),
			changeFamily,
			mintRevisionTag,
			this._events,
			this.telemetryEventBatcher,
		);

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

		// Track all forks of the local branch for purposes of trunk eviction. Unlike the local branch, they have
		// an unknown lifetime and rebase frequency, so we can not make any assumptions about which trunk commits
		// they require and therefore we monitor them explicitly.
		onForkTransitive(this.localBranch, (fork) => this.registerBranch(fork));
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
				this.trimTrunk();
			}
		});
		// When the branch is disposed, update our branch set and trim the trunk
		const offDispose = branch.events.on("dispose", () => {
			this.untrackBranch(branch);
			this.trimTrunk();
			offBeforeRebase();
			offAfterRebase();
			offDispose();
		});
	}

	private trackBranch(b: SharedTreeBranch<TEditor, TChangeset>): void {
		const trunkCommit =
			findCommonAncestor(this.trunk.getHead(), b.getHead()) ??
			fail("Expected branch to be related to trunk");
		const sequenceId = this.getCommitSequenceId(trunkCommit);
		const branches = getOrCreate(this.trunkBranches, sequenceId, () => new Set());

		assert(!branches.has(b), 0x670 /* Branch was registered more than once */);
		branches.add(b);
	}

	private untrackBranch(b: SharedTreeBranch<TEditor, TChangeset>): void {
		const trunkCommit =
			findCommonAncestor(this.trunk.getHead(), b.getHead()) ??
			fail("Expected branch to be related to trunk");
		const sequenceId = this.getCommitSequenceId(trunkCommit);
		const branches =
			this.trunkBranches.get(sequenceId) ?? fail("Expected branch to be tracked");

		assert(branches.delete(b), 0x671 /* Expected branch to be tracked */);
		if (branches.size === 0) {
			this.trunkBranches.delete(sequenceId);
		}
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
	private fastForwardNextLocalCommit(sequenceId: SequenceId): void {
		// First, push the local commit to the trunk.
		// We are mutating our `localCommits` cache here, but there is no need to actually change the `localBranch` itself because it will simply catch up later if/when it next rebases.
		const firstLocalCommit = this.localCommits.shift();
		assert(
			firstLocalCommit !== undefined,
			0x6b5 /* Received a sequenced change from the local session despite having no local changes */,
		);

		const previousSequenceId = this.getCommitSequenceId(this.trunk.getHead());
		this.pushGraphCommitToTrunk(sequenceId, firstLocalCommit, this.localSessionId);

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
			for (const branch of currentBranches) {
				// Check every branch associated with the old sequence ID and advance it if it is based on the local branch (specifically, on the local branch as it was before we pushed its first commit to the trunk).
				// We validate this by checking if the branch's head is a descendant of the local commit that we just pushed.
				if (findAncestor(branch.getHead(), (c) => c === firstLocalCommit) !== undefined) {
					newBranches.add(branch);
					currentBranches.delete(branch);
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
	}

	/**
	 * Return the sequence number at which the given commit was sequenced on the trunk, or undefined if the commit is not part of the trunk.
	 */
	public getSequenceNumber(trunkCommit: GraphCommit<TChangeset>): SeqNumber | undefined {
		return this.trunkMetadata.get(trunkCommit.revision)?.sequenceId.sequenceNumber;
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
		trimTrunk = true,
	): void {
		if (minimumSequenceNumber === this.minimumSequenceNumber) {
			return;
		}

		assert(
			minimumSequenceNumber > this.minimumSequenceNumber,
			0x476 /* number must be larger or equal to current minimumSequenceNumber. */,
		);

		this.minimumSequenceNumber = minimumSequenceNumber;
		if (trimTrunk) {
			this.trimTrunk();
		}
	}

	/**
	 * Examines the latest known minimum sequence number and the trunk bases of any registered branches to determine
	 * if any commits on the trunk are unreferenced and unneeded for future computation; those found are evicted from the trunk.
	 */
	private trimTrunk(): void {
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

		const [sequenceId, latestEvicted] = this.getClosestTrunkCommit(
			maxSequenceId(
				trunkTailSequenceId,
				this.sequenceMap.minKey() ?? minimumPossibleSequenceId,
			),
		);

		// Don't do any work if the commit found by the search is already the tail of the trunk
		if (latestEvicted !== this.trunkBase) {
			// The minimum sequence number informs us that all peer branches are at least caught up to the tail commit,
			// so rebase them accordingly. This is necessary to prevent peer branches from referencing any evicted commits.
			for (const [, branch] of this.peerLocalBranches) {
				branch.rebaseOnto(this.trunk, latestEvicted);
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
			// The metadata for new trunk base revision needs to be deleted before modifying it.
			this.trunkMetadata.delete(newTrunkBase.revision);
			// collect the revisions that will be trimmed to send as part of the branch trimmed event
			const trimmedRevisions: RevisionTag[] = getPathFromBase(
				newTrunkBase,
				this.trunkBase,
			).map((c) => c.revision);
			// Dropping the parent field removes (transitively) all references to the evicted commits so they can be garbage collected.
			delete newTrunkBase.parent;
			this.trunkBase = newTrunkBase;

			// Update any state that is derived from trunk commits
			this.sequenceMap.editRange(minimumPossibleSequenceId, sequenceId, true, (s, commit) => {
				// Cleanup look-aside data for each evicted commit
				this.trunkMetadata.delete(commit.revision);
				// Delete all evicted commits from `sequenceMap` except for the latest one, which is the new `trunkBase`
				if (equalSequenceIds(s, sequenceId)) {
					assert(
						commit === newTrunkBase,
						0x729 /* Expected last evicted commit to be new trunk base */,
					);
				} else {
					Reflect.defineProperty(commit, "change", {
						get: () =>
							assert(
								false,
								0xa5e /* Should not access 'change' property of an evicted commit */,
							),
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
							assert(
								false,
								0xa60 /* Should not access 'parent' property of an evicted commit */,
							),
					});
					return { delete: true };
				}
			});

			const trunkSize = getPathFromBase(this.trunk.getHead(), this.trunkBase).length;
			assert(
				this.sequenceMap.size === trunkSize + 1,
				0x744 /* The size of the sequenceMap must have one element more than the trunk */,
			);
			assert(
				this.trunkMetadata.size === trunkSize,
				0x745 /* The size of the trunkMetadata must be the same as the trunk */,
			);

			this._events.emit("ancestryTrimmed", trimmedRevisions);
		}
	}

	public isEmpty(): boolean {
		return (
			this.trunk.getHead() === this.trunkBase &&
			this.peerLocalBranches.size === 0 &&
			this.localBranch.getHead() === this.trunk.getHead() &&
			this.minimumSequenceNumber === minimumPossibleSequenceNumber
		);
	}

	public getSummaryData(): SummaryData<TChangeset> {
		// The assert below is acceptable at present because summarization only ever occurs on a client with no
		// local/in-flight changes.
		// In the future we may wish to relax this constraint. For that to work, the current implementation of
		// `EditManager` would have to be amended in one of two ways:
		// A) Changes made by the local session should be represented by a branch in `EditManager.branches`.
		// B) The contents of such a branch should be computed on demand based on the trunk.
		// Note that option (A) would be a simple change to `addSequencedChange` whereas (B) would likely require
		// rebasing trunk changes over the inverse of trunk changes.
		assert(
			this.localBranch.getHead() === this.trunk.getHead(),
			0x428 /* Clients with local changes cannot be used to generate summaries */,
		);

		// Trimming the trunk before serializing ensures that the trunk data in the summary is as minimal as possible.
		this.trimTrunk();

		let oldestCommitInCollabWindow = this.getClosestTrunkCommit(this.minimumSequenceNumber)[1];
		assert(
			oldestCommitInCollabWindow.parent !== undefined ||
				oldestCommitInCollabWindow === this.trunkBase,
			0x8c7 /* Expected oldest commit in collab window to have a parent or be the trunk base */,
		);

		// Path construction is exclusive, so we need to use the parent of the oldest commit in the window if it exists
		oldestCommitInCollabWindow =
			oldestCommitInCollabWindow.parent ?? oldestCommitInCollabWindow;

		const trunk = getPathFromBase(this.trunk.getHead(), oldestCommitInCollabWindow).map(
			(c) => {
				assert(
					c !== this.trunkBase,
					0xa61 /* Serialized trunk should not include the trunk base */,
				);
				const metadata =
					this.trunkMetadata.get(c.revision) ?? fail("Expected metadata for trunk commit");
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
			},
		);

		const peerLocalBranches = new Map<SessionId, SummarySessionBranch<TChangeset>>(
			mapIterable(this.peerLocalBranches.entries(), ([sessionId, branch]) => {
				const branchPath: GraphCommit<TChangeset>[] = [];
				const ancestor =
					findCommonAncestor([branch.getHead(), branchPath], this.trunk.getHead()) ??
					fail("Expected branch to be based on trunk");

				const base = ancestor === this.trunkBase ? rootRevision : ancestor.revision;
				return [
					sessionId,
					{
						base,
						commits: branchPath.map((c) => {
							assert(
								c !== this.trunkBase,
								0xa62 /* Serialized branch should not include the trunk base */,
							);
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

		return { trunk, peerLocalBranches };
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
				this.sequenceMap.set(sequenceId, commit);
				this.trunkMetadata.set(c.revision, {
					sequenceId,
					sessionId: c.sessionId,
				});
				trunkRevisionCache.set(c.revision, commit);
				return commit;
			}, this.trunkBase),
		);

		this.localBranch.setHead(this.trunk.getHead());

		for (const [sessionId, branch] of data.peerLocalBranches) {
			const commit =
				trunkRevisionCache.get(branch.base) ??
				fail("Expected summary branch to be based off of a revision in the trunk");

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

	private getCommitSequenceId(trunkCommitOrTrunkBase: GraphCommit<TChangeset>): SequenceId {
		const id = this.trunkMetadata.get(trunkCommitOrTrunkBase.revision)?.sequenceId;
		if (id === undefined) {
			assert(
				trunkCommitOrTrunkBase === this.trunkBase,
				0xa63 /* Commit must be either be on the trunk or be the trunk base */,
			);
			return minimumPossibleSequenceId;
		}
		return id;
	}

	public getTrunkChanges(): readonly TChangeset[] {
		return this.getTrunkCommits().map((c) => c.change);
	}

	public getTrunkCommits(): readonly GraphCommit<TChangeset>[] {
		return getPathFromBase(this.trunk.getHead(), this.trunkBase);
	}

	public getTrunkHead(): GraphCommit<TChangeset> {
		return this.trunk.getHead();
	}

	public getLocalChanges(): readonly TChangeset[] {
		return this.getLocalCommits().map((c) => c.change);
	}

	public getLocalCommits(): readonly GraphCommit<TChangeset>[] {
		return this.localCommits;
	}

	/**
	 * @returns The length of the longest branch maintained by this EditManager.
	 * This may be the length of a peer branch or the local branch.
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

	public addSequencedChange(
		newCommit: Commit<TChangeset>,
		sequenceNumber: SeqNumber,
		referenceSequenceNumber: SeqNumber,
	): void {
		assert(
			sequenceNumber > this.minimumSequenceNumber,
			0x713 /* Expected change sequence number to exceed the last known minimum sequence number */,
		);

		assert(
			sequenceNumber >= // This is ">=", not ">" because changes in the same batch will have the same sequence number
				(this.sequenceMap.maxKey()?.sequenceNumber ?? minimumPossibleSequenceNumber),
			0xa64 /* Attempted to sequence change with an outdated sequence number */,
		);

		const commitsSequenceNumber = this.getBatch(sequenceNumber);
		const sequenceId: SequenceId =
			commitsSequenceNumber.length === 0
				? {
						sequenceNumber,
					}
				: {
						sequenceNumber,
						indexInBatch: commitsSequenceNumber.length,
					};

		if (newCommit.sessionId === this.localSessionId) {
			return this.fastForwardNextLocalCommit(sequenceId);
		}

		// Get the revision that the remote change is based on
		const [, baseRevisionInTrunk] = this.getClosestTrunkCommit(referenceSequenceNumber);
		// Rebase that branch over the part of the trunk up to the base revision
		// This will be a no-op if the sending client has not advanced since the last time we received an edit from it
		const peerLocalBranch = getOrCreate(
			this.peerLocalBranches,
			newCommit.sessionId,
			() => new SharedTreeBranch(baseRevisionInTrunk, this.changeFamily, this.mintRevisionTag),
		);
		peerLocalBranch.rebaseOnto(this.trunk, baseRevisionInTrunk);

		if (peerLocalBranch.getHead() === this.trunk.getHead()) {
			// If the branch is fully caught up and empty after being rebased, then push to the trunk directly
			this.pushCommitToTrunk(sequenceId, newCommit);
			peerLocalBranch.setHead(this.trunk.getHead());
		} else {
			// Otherwise, rebase the change over the trunk and append it, and append the original change to the peer branch.
			const { duration, output: newChangeFullyRebased } = measure(() =>
				rebaseChange(
					this.changeFamily.rebaser,
					newCommit,
					peerLocalBranch.getHead(),
					this.trunk.getHead(),
					this.mintRevisionTag,
				),
			);

			this.telemetryEventBatcher?.accumulateAndLog({
				duration,
				...newChangeFullyRebased.telemetryProperties,
			});

			peerLocalBranch.apply(tagChange(newCommit.change, newCommit.revision));
			this.pushCommitToTrunk(sequenceId, {
				...newCommit,
				change: newChangeFullyRebased.change,
			});
		}

		this.localBranch.rebaseOnto(this.trunk);
	}

	public findLocalCommit(
		revision: RevisionTag,
	): [commit: GraphCommit<TChangeset>, commitsAfter: GraphCommit<TChangeset>[]] {
		const commits: GraphCommit<TChangeset>[] = [];
		const commit = findAncestor(
			[this.localBranch.getHead(), commits],
			(c) => c.revision === revision,
		);
		assert(commit !== undefined, 0x599 /* Expected local branch to contain revision */);
		return [commit, commits];
	}

	private pushCommitToTrunk(sequenceId: SequenceId, commit: Commit<TChangeset>): void {
		const mintedCommit = mintCommit(this.trunk.getHead(), commit);
		this.pushGraphCommitToTrunk(sequenceId, mintedCommit, commit.sessionId);
	}

	private pushGraphCommitToTrunk(
		sequenceId: SequenceId,
		graphCommit: GraphCommit<TChangeset>,
		sessionId: SessionId,
	): void {
		this.trunk.setHead(graphCommit);
		const trunkHead = this.trunk.getHead();
		this.sequenceMap.set(sequenceId, trunkHead);
		this.trunkMetadata.set(trunkHead.revision, { sequenceId, sessionId });
	}

	/**
	 * Finds the most recent trunk commit that was sequenced at or before the given point.
	 * @param searchBy - the sequence number or the sequence id to search for
	 * @remarks Fails if there is no eligible commit.
	 * @returns the closest commit and its sequence id
	 */
	private getClosestTrunkCommit(searchBy: SeqNumber): [SequenceId, GraphCommit<TChangeset>];
	private getClosestTrunkCommit(searchBy: SequenceId): [SequenceId, GraphCommit<TChangeset>];
	private getClosestTrunkCommit(
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

		const commit = this.sequenceMap.getPairOrNextLower(sequenceId);
		assert(commit !== undefined, 0x746 /* sequence id has been evicted */);
		return commit;
	}

	private getBatch(sequenceNumber: SeqNumber): [SequenceId, GraphCommit<TChangeset>][] {
		const startSequenceId: SequenceId = {
			sequenceNumber,
		};
		const endSequenceId: SequenceId = {
			sequenceNumber: brand((sequenceNumber as number) + 1),
		};

		return this.sequenceMap.getRange(startSequenceId, endSequenceId, false);
	}
}

/**
 * The in-memory data that summaries contain
 */
export interface SummaryData<TChangeset> {
	readonly trunk: readonly SequencedCommit<TChangeset>[];
	readonly peerLocalBranches: ReadonlyMap<SessionId, SummarySessionBranch<TChangeset>>;
}

/**
 * @returns the path from the base of a branch to its head
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

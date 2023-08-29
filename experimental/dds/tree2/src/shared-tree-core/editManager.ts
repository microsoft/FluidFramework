/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import BTree from "sorted-btree";
import { assert } from "@fluidframework/common-utils";
import { brand, fail, getOrCreate, mapIterable, Mutable, RecursiveReadonly } from "../util";
import {
	AnchorSet,
	assertIsRevisionTag,
	ChangeFamily,
	ChangeFamilyEditor,
	findAncestor,
	findCommonAncestor,
	GraphCommit,
	IRepairDataStoreProvider,
	mintCommit,
	rebaseChange,
	RevisionTag,
	SessionId,
	SimpleDependee,
	UndoRedoManager,
} from "../core";
import { createEmitter, ISubscribable } from "../events";
import { getChangeReplaceType, onForkTransitive, SharedTreeBranch } from "./branch";
import {
	Commit,
	SeqNumber,
	SequenceId,
	sequenceIdComparator,
	equalSequenceIds,
	minSequenceId,
	SequencedCommit,
	SummarySessionBranch,
} from "./editManagerFormat";

export const minimumPossibleSequenceNumber: SeqNumber = brand(Number.MIN_SAFE_INTEGER);
const minimumPossibleSequenceId: SequenceId = {
	sequenceNumber: minimumPossibleSequenceNumber,
};

export interface EditManagerEvents<TChangeset> {
	/**
	 * Fired every time that a new commit is added to the trunk
	 * @param newHead - the new head of the trunk
	 */
	newTrunkHead(newHead: GraphCommit<TChangeset>): void;
}

/**
 * Represents a local branch of a document and interprets the effect on the document of adding sequenced changes,
 * which were based on a given session's branch, to the document history
 */
// TODO: Try to reduce this to a single type parameter
export class EditManager<
		TEditor extends ChangeFamilyEditor,
		TChangeset,
		TChangeFamily extends ChangeFamily<TEditor, TChangeset>,
	>
	extends SimpleDependee
	implements ISubscribable<EditManagerEvents<TChangeset>>
{
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

	/** The {@link UndoRedoManager} associated with the trunk */
	private readonly trunkUndoRedoManager: UndoRedoManager<TChangeset, TEditor>;

	/**
	 * Branches are maintained to represent the local change list that the issuing client had
	 * at the time of submitting the latest known edit on the branch.
	 * This means the head commit of each branch is always in its original (non-rebased) form.
	 */
	// TODO:#4593: Add test to ensure that peer branches are never initialized with a repairDataStoreProvider
	private readonly peerLocalBranches: Map<SessionId, SharedTreeBranch<TEditor, TChangeset>> =
		new Map();

	/**
	 * This branch holds the changes made by this client which have not yet been confirmed as sequenced changes.
	 */
	public readonly localBranch: SharedTreeBranch<TEditor, TChangeset>;

	/** The {@link UndoRedoManager} associated with the local branch. */
	private readonly localBranchUndoRedoManager: UndoRedoManager<TChangeset, TEditor>;

	/**
	 * Tracks where on the trunk all registered branches are based. Each key is the sequence id of a commit on
	 * the trunk, and the value is the set of all branches who have that commit as their common ancestor with the trunk.
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

	private readonly events = createEmitter<EditManagerEvents<TChangeset>>();

	public on<K extends keyof EditManagerEvents<TChangeset>>(
		eventName: K,
		listener: EditManagerEvents<TChangeset>[K],
	): () => void {
		return this.events.on(eventName, listener);
	}

	/**
	 * @param changeFamily - the change family of changes on the trunk and local branch
	 * @param localSessionId - the id of the local session that will be used for local commits
	 * @param repairDataStoreProvider - used for undoing/redoing the local branch
	 * @param anchors - an optional set of anchors to be rebased by the local branch when it changes
	 */
	public constructor(
		public readonly changeFamily: TChangeFamily,
		// TODO: Change this type to be the Session ID type provided by the IdCompressor when available.
		public readonly localSessionId: SessionId,
		repairDataStoreProvider: IRepairDataStoreProvider<TChangeset>,
		anchors?: AnchorSet,
	) {
		super("EditManager");
		this.trunkBase = {
			revision: assertIsRevisionTag("00000000-0000-4000-8000-000000000000"),
			change: changeFamily.rebaser.compose([]),
		};
		this.sequenceMap.set(minimumPossibleSequenceId, this.trunkBase);
		this.localBranchUndoRedoManager = UndoRedoManager.create(changeFamily);
		this.trunkUndoRedoManager = this.localBranchUndoRedoManager.clone();
		this.trunk = new SharedTreeBranch(
			this.trunkBase,
			changeFamily,
			repairDataStoreProvider.clone(),
			this.trunkUndoRedoManager,
		);
		this.localBranch = new SharedTreeBranch(
			this.trunk.getHead(),
			changeFamily,
			repairDataStoreProvider,
			this.localBranchUndoRedoManager,
			anchors,
		);

		// Track all forks of the local branch for purposes of trunk eviction. Unlike the local branch, they have
		// an unknown lifetime and rebase frequency, so we can not make any assumptions about which trunk commits
		// they require and therefore we monitor them explicitly.
		onForkTransitive(this.localBranch, (fork) => this.registerBranch(fork));
	}

	/**
	 * Make the given branch known to the `EditManager`. The `EditManager` will ensure that all registered
	 * branches remain usable even as the minimum sequence number advances.
	 */
	private registerBranch(branch: SharedTreeBranch<TEditor, TChangeset>): void {
		const trackBranch = (b: SharedTreeBranch<TEditor, TChangeset>): SequenceId => {
			const trunkCommit =
				findCommonAncestor(this.trunk.getHead(), b.getHead()) ??
				fail("Expected branch to be related to trunk");
			const sequenceId =
				this.trunkMetadata.get(trunkCommit.revision)?.sequenceId ??
				minimumPossibleSequenceId;
			const branches = getOrCreate(this.trunkBranches, sequenceId, () => new Set());

			assert(!branches.has(b), 0x670 /* Branch was registered more than once */);
			branches.add(b);
			return sequenceId;
		};

		const untrackBranch = (
			b: SharedTreeBranch<TEditor, TChangeset>,
			sequenceId: SequenceId,
		): void => {
			const branches =
				this.trunkBranches.get(sequenceId) ?? fail("Expected branch to be tracked");

			assert(branches.delete(b), 0x671 /* Expected branch to be tracked */);
			if (branches.size === 0) {
				this.trunkBranches.delete(sequenceId);
			}
		};

		// Record the sequence id of the branch's base commit on the trunk
		const trunkBase = { sequenceId: trackBranch(branch) };
		// Whenever the branch is rebased, update our record of its base trunk commit
		const offRebase = branch.on("change", (args) => {
			if (args.type === "replace" && getChangeReplaceType(args) === "rebase") {
				untrackBranch(branch, trunkBase.sequenceId);
				trunkBase.sequenceId = trackBranch(branch);
				this.trimTrunk();
			}
		});
		// When the branch is disposed, update our branch set and trim the trunk
		const offDispose = branch.on("dispose", () => {
			untrackBranch(branch, trunkBase.sequenceId);
			this.trimTrunk();
			offRebase();
			offDispose();
		});
	}

	/**
	 * Advances the minimum sequence number, and removes all commits from the trunk which lie outside the collaboration window.
	 * @param minimumSequenceNumber - the sequence number of the newest commit that all peers (including this one) have received and applied to their trunks.
	 *
	 * @remarks If there are more than one commit with the same sequence number we assume this refers to the last commit in the batch.
	 */
	public advanceMinimumSequenceNumber(minimumSequenceNumber: SeqNumber): void {
		if (minimumSequenceNumber === this.minimumSequenceNumber) {
			return;
		}

		assert(
			minimumSequenceNumber > this.minimumSequenceNumber,
			0x476 /* number must be larger or equal to current minimumSequenceNumber. */,
		);

		this.minimumSequenceNumber = minimumSequenceNumber;
		this.trimTrunk();
	}

	/**
	 * Examines the latest known minimum sequence number and the trunk bases of any registered branches to determine
	 * if any commits on the trunk are unreferenced and unneeded for future computation; those found are evicted from the trunk.
	 * @returns the number of commits that were removed from the trunk
	 */
	private trimTrunk(): void {
		/** The sequence id of the oldest commit on the trunk that will be retained */
		let trunkTailSequenceId: SequenceId = {
			sequenceNumber: this.minimumSequenceNumber,
			indexInBatch: Number.POSITIVE_INFINITY,
		};
		// If there are any outstanding registered branches, get the one that is the oldest (has the "most behind" trunk base)
		const minimumBranchBaseSequenceId = this.trunkBranches.minKey();
		if (minimumBranchBaseSequenceId !== undefined) {
			// If that branch is behind the minimum sequence id, we only want to evict commits older than it,
			// even if those commits are behind the minimum sequence id
			trunkTailSequenceId = minSequenceId(trunkTailSequenceId, minimumBranchBaseSequenceId);
		}

		const [sequenceId, latestEvicted] = this.getClosestTrunkCommit(trunkTailSequenceId);
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
			// Copying the revision of the old trunk base into the new trunk base means we don't need to write out the original
			// revision to summaries. All clients agree that the trunk base always has the same hardcoded revision.
			newTrunkBase.revision = this.trunkBase.revision;
			// Overwriting the change is not strictly necessary, but done here for consistency (so all trunk bases are deeply equal).
			newTrunkBase.change = this.trunkBase.change;
			// Dropping the parent field removes (transitively) all references to the evicted commits so they can be garbage collected.
			delete newTrunkBase.parent;
			this.trunkBase = newTrunkBase;

			// Update any state that is derived from trunk commits
			this.sequenceMap.editRange(
				minimumPossibleSequenceId,
				sequenceId,
				true,
				(s, { revision }) => {
					// Cleanup look-aside data for each evicted commit
					this.trunkMetadata.delete(revision);
					this.localBranchUndoRedoManager.untrackCommitType(revision);
					// Delete all evicted commits from `sequenceMap` except for the latest one, which is the new `trunkBase`
					if (equalSequenceIds(s, sequenceId)) {
						assert(
							revision === newTrunkBase.revision,
							0x729 /* Expected last evicted commit to be new trunk base */,
						);
					} else {
						return { delete: true };
					}
				},
			);

			const trunkSize = getPathFromBase(this.trunk.getHead(), this.trunkBase).length;
			assert(
				this.sequenceMap.size === trunkSize + 1,
				0x744 /* The size of the sequenceMap must have one element more than the trunk */,
			);
			assert(
				this.trunkMetadata.size === trunkSize,
				0x745 /* The size of the trunkMetadata must be the same as the trunk */,
			);
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

		const trunk = getPathFromBase(this.trunk.getHead(), this.trunkBase).map((c) => {
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
		});

		const branches = new Map<SessionId, SummarySessionBranch<TChangeset>>(
			mapIterable(this.peerLocalBranches.entries(), ([sessionId, branch]) => {
				const branchPath: GraphCommit<TChangeset>[] = [];
				const ancestor =
					findCommonAncestor([branch.getHead(), branchPath], this.trunk.getHead()) ??
					fail("Expected branch to be based on trunk");

				return [
					sessionId,
					{
						base: ancestor.revision,
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

		return { trunk, branches };
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

		for (const [sessionId, branch] of data.branches) {
			const commit =
				trunkRevisionCache.get(branch.base) ??
				fail("Expected summary branch to be based off of a revision in the trunk");

			this.peerLocalBranches.set(
				sessionId,
				new SharedTreeBranch(branch.commits.reduce(mintCommit, commit), this.changeFamily),
			);
		}
	}

	public getTrunkChanges(): readonly RecursiveReadonly<TChangeset>[] {
		return getPathFromBase(this.trunk.getHead(), this.trunkBase).map((c) => c.change);
	}

	public getTrunkHead(): GraphCommit<TChangeset> {
		return this.trunk.getHead();
	}

	public getLocalChanges(): readonly RecursiveReadonly<TChangeset>[] {
		return getPathFromBase(this.localBranch.getHead(), this.trunk.getHead()).map(
			(c) => c.change,
		);
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

	/**
	 * Needs to be called after a summary is loaded.
	 * @remarks This is necessary to keep the trunk's repairDataStoreProvider up to date with the
	 * local's after a summary load.
	 */
	public afterSummaryLoad(): void {
		assert(
			this.localBranch.repairDataStoreProvider !== undefined,
			0x6cb /* Local branch must maintain repair data */,
		);
		this.trunk.repairDataStoreProvider = this.localBranch.repairDataStoreProvider.clone();
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
			const [firstLocalCommit] = getPathFromBase(
				this.localBranch.getHead(),
				this.trunk.getHead(),
			);
			assert(
				firstLocalCommit !== undefined,
				0x6b5 /* Received a sequenced change from the local session despite having no local changes */,
			);

			// The first local branch commit is already rebased over the trunk, so we can push it directly to the trunk.
			this.pushToTrunk(
				sequenceId,
				{ ...firstLocalCommit, sessionId: this.localSessionId },
				true,
			);
			this.localBranch.rebaseOnto(this.trunk);
			return;
		}

		// Get the revision that the remote change is based on
		const [, baseRevisionInTrunk] = this.getClosestTrunkCommit(referenceSequenceNumber);
		// Rebase that branch over the part of the trunk up to the base revision
		// This will be a no-op if the sending client has not advanced since the last time we received an edit from it
		const peerLocalBranch = getOrCreate(
			this.peerLocalBranches,
			newCommit.sessionId,
			() => new SharedTreeBranch(baseRevisionInTrunk, this.changeFamily),
		);
		peerLocalBranch.rebaseOnto(this.trunk, baseRevisionInTrunk);

		if (peerLocalBranch.getHead() === this.trunk.getHead()) {
			// If the branch is fully caught up and empty after being rebased, then push to the trunk directly
			this.pushToTrunk(sequenceId, newCommit);
			peerLocalBranch.setHead(this.trunk.getHead());
		} else {
			// Otherwise, rebase the change over the trunk and append it, and append the original change to the peer branch.
			const newChangeFullyRebased = rebaseChange(
				this.changeFamily.rebaser,
				newCommit.change,
				peerLocalBranch.getHead(),
				this.trunk.getHead(),
			);

			peerLocalBranch.apply(newCommit.change, newCommit.revision);
			this.pushToTrunk(sequenceId, {
				...newCommit,
				change: newChangeFullyRebased,
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

	private pushToTrunk(sequenceId: SequenceId, commit: Commit<TChangeset>, local = false): void {
		this.trunk.setHead(mintCommit(this.trunk.getHead(), commit));
		const trunkHead = this.trunk.getHead();
		if (local) {
			const type =
				this.localBranchUndoRedoManager.getCommitType(trunkHead.revision) ??
				fail("Local commit types must be tracked until they are sequenced.");

			this.trunkUndoRedoManager.trackCommit(trunkHead, type);
		}
		this.trunk.repairDataStoreProvider?.applyChange(commit.change);
		this.sequenceMap.set(sequenceId, trunkHead);
		this.trunkMetadata.set(trunkHead.revision, { sequenceId, sessionId: commit.sessionId });
		this.events.emit("newTrunkHead", trunkHead);
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
	readonly branches: ReadonlyMap<SessionId, SummarySessionBranch<TChangeset>>;
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

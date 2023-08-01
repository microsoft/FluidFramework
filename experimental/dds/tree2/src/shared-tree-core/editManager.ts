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
import { Commit, SeqNumber, SequencedCommit, SummarySessionBranch } from "./editManagerFormat";

export const minimumPossibleSequenceNumber: SeqNumber = brand(Number.MIN_SAFE_INTEGER);
const nullRevisionTag = assertIsRevisionTag("00000000-0000-4000-8000-000000000000");

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
	/** Records extra data associated with trunk commits */
	private readonly trunkMetadata = new Map<
		RevisionTag,
		{ sequenceNumber: SeqNumber; sessionId: SessionId }
	>();
	/** A map from a sequence number to the commit in the trunk which has that sequence number */
	private readonly sequenceMap = new BTree<SeqNumber, GraphCommit<TChangeset>>();

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
	 * Tracks where on the trunk all registered branches are based. Each key is the sequence number of a commit on
	 * the trunk, and the value is the set of all branches who have that commit as their common ancestor with the trunk.
	 */
	private readonly trunkBranches = new BTree<
		SeqNumber,
		Set<SharedTreeBranch<TEditor, TChangeset>>
	>();

	/**
	 * The sequence number of the newest commit on the trunk that has been received by all peers.
	 * Defaults to {@link minimumPossibleSequenceNumber} if no commits have been received.
	 */
	private minimumSequenceNumber = minimumPossibleSequenceNumber;

	/**
	 * An immutable "origin" commit singleton on which the trunk is based.
	 * This makes it possible to model the trunk in the same way as any other branch
	 * (it branches off of a base commit) which simplifies some logic.
	 */
	private readonly trunkBase: GraphCommit<TChangeset>;

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
			revision: nullRevisionTag,
			change: changeFamily.rebaser.compose([]),
		};
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
		// This registers each fork of the local branch, rather than registering the local branch directly.
		// Registering the local branch _almost_ works the same, except that it means the trunk retains an
		// additional commit - because the local branch is always rebased off of the trunk's head, we can
		// never evict the head. That sounds like a good thing, but because the trunk has a privileged
		// relationship with the local branch (the local branch doesn't undergo normal rebasing), we can
		// actually safely evict that last commit (assuming there are no other outstanding branches).
		// TODO:#4918: Fiddle with the local case of addSequencedChange some more, and see if you can make it actually do a rebase.
		onForkTransitive(this.localBranch, (fork) => this.registerBranch(fork));
	}

	/**
	 * Make the given branch known to the `EditManager`. The `EditManager` will ensure that all registered
	 * branches remain usable even as the minimum sequence number advances.
	 * @param branch - the branch to register. All branches that fork from this branch, directly or transitively,
	 * will also be registered.
	 */
	private registerBranch(branch: SharedTreeBranch<TEditor, TChangeset>): void {
		const trackBranch = (b: SharedTreeBranch<TEditor, TChangeset>): SeqNumber => {
			const trunkCommit =
				findCommonAncestor(this.trunk.getHead(), b.getHead()) ??
				fail("Expected branch to be related to trunk");
			const sequenceNumber =
				this.trunkMetadata.get(trunkCommit.revision)?.sequenceNumber ??
				minimumPossibleSequenceNumber;
			const branches = getOrCreate(this.trunkBranches, sequenceNumber, () => new Set());

			assert(!branches.has(b), 0x670 /* Branch was registered more than once */);
			branches.add(b);
			return sequenceNumber;
		};

		const untrackBranch = (
			b: SharedTreeBranch<TEditor, TChangeset>,
			sequenceNumber: SeqNumber,
		): void => {
			const branches =
				this.trunkBranches.get(sequenceNumber) ?? fail("Expected branch to be tracked");

			assert(branches.delete(b), 0x671 /* Expected branch to be tracked */);
			if (branches.size === 0) {
				this.trunkBranches.delete(sequenceNumber);
			}
		};

		// Record the sequence number of the branch's base commit on the trunk
		const trunkBase = { sequenceNumber: trackBranch(branch) };
		// Whenever the branch is rebased, update our record of its base trunk commit
		const offRebase = branch.on("change", (args) => {
			if (args.type === "replace" && getChangeReplaceType(args) === "rebase") {
				untrackBranch(branch, trunkBase.sequenceNumber);
				trunkBase.sequenceNumber = trackBranch(branch);
			}
		});
		// When the branch is disposed, update our branch set and trim the trunk
		const offDispose = branch.on("dispose", () => {
			untrackBranch(branch, trunkBase.sequenceNumber);
			this.trimTrunk();
			offRebase();
			offDispose();
		});
	}

	/**
	 * Advances the minimum sequence number, and removes all commits from the trunk which lie outside the collaboration window.
	 * @param minimumSequenceNumber - the sequence number of the newest commit that all peers (including this one) have received and applied to their trunks
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
	private trimTrunk(): number {
		let deleted = 0;
		/** The sequence number of the oldest commit on the trunk that will be retained */
		let trunkTailSearchKey = this.minimumSequenceNumber;
		// If there are any outstanding registered branches, get the one that is the oldest (has the "most behind" trunk base)
		const minimumBranchBaseSequenceNumber = this.trunkBranches.minKey();
		if (minimumBranchBaseSequenceNumber !== undefined) {
			// If that branch is behind the minimum sequence number, we only want to evict commits older than it,
			// even if those commits are behind the minimum sequence number
			trunkTailSearchKey = brand(
				Math.min(trunkTailSearchKey, minimumBranchBaseSequenceNumber),
			);
		}

		// The new tail of the trunk is the commit at or just past the new minimum trunk sequence number
		const searchResult = this.sequenceMap.getPairOrNextHigher(trunkTailSearchKey);
		if (searchResult !== undefined) {
			const [, newTrunkTail] = searchResult;
			// Don't do any work if the commit found by the search is already the tail of the trunk
			if (newTrunkTail.parent !== this.trunkBase) {
				// The minimum sequence number informs us that all peer branches are at least caught up to the tail commit,
				// so rebase them accordingly. This is necessary to prevent peer branches from referencing any evicted commits.
				for (const [, branch] of this.peerLocalBranches) {
					branch.rebaseOnto(this.trunk, newTrunkTail);
				}

				// This is dangerous. Commits ought to be immutable, but if they are then changing the trunk tail requires
				// regenerating the entire commit graph. It is, in general, safe to chop off the tail like this if we know
				// that there are no outstanding references to any of the commits being removed. For example, there must be
				// no existing branches that are based off of any of the commits being removed.
				(newTrunkTail as Mutable<GraphCommit<TChangeset>>).parent = this.trunkBase;

				const sequenceNumber =
					this.trunkMetadata.get(newTrunkTail.revision)?.sequenceNumber ??
					minimumPossibleSequenceNumber;
				this.sequenceMap.forRange(
					minimumPossibleSequenceNumber,
					sequenceNumber,
					false,
					(_seq, { revision }) => {
						this.trunkMetadata.delete(revision);
						this.localBranchUndoRedoManager.untrackCommitType(revision);
					},
				);

				deleted = this.sequenceMap.deleteRange(
					minimumPossibleSequenceNumber,
					sequenceNumber,
					false,
				);
			}
		} else {
			// If no trunk commit is found, it means that all trunk commits are below the search key, so evict them all
			assert(
				this.trunkBranches.isEmpty ||
					// This handles the case when there are branches but they are already based off of the origin commit.
					// TODO:#4918: Investigate if we can handle this case more gracefully by including the origin commit in `sequenceMap`
					(this.trunkBranches.size === 1 &&
						this.trunkBranches.minKey() === minimumPossibleSequenceNumber),
				0x711 /* Expected no outstanding branches when clearing trunk */,
			);
			this.trunk.setHead(this.trunkBase);
			this.sequenceMap.clear();
			this.peerLocalBranches.clear();
		}

		return deleted;
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
				sequenceNumber: metadata.sequenceNumber,
				sessionId: metadata.sessionId,
			};
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
		this.sequenceMap.clear();
		this.trunk.setHead(
			data.trunk.reduce((base, c) => {
				const commit = mintCommit(base, c);
				this.sequenceMap.set(c.sequenceNumber, commit);
				this.trunkMetadata.set(c.revision, {
					sequenceNumber: c.sequenceNumber,
					sessionId: c.sessionId,
				});
				return commit;
			}, this.trunkBase),
		);

		this.localBranch.setHead(this.trunk.getHead());

		for (const [sessionId, branch] of data.branches) {
			const commit: GraphCommit<TChangeset> =
				findAncestor(this.trunk.getHead(), (r) => r.revision === branch.base) ??
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
			"Expected change sequence number to exceed the last known minimum sequence number",
		);
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
				sequenceNumber,
				{ ...firstLocalCommit, sessionId: this.localSessionId },
				true,
			);
			this.localBranch.rebaseOnto(this.trunk);
			return;
		}

		// Get the revision that the remote change is based on
		const baseRevisionInTrunk =
			this.sequenceMap.getPairOrNextLower(referenceSequenceNumber)?.[1] ?? this.trunkBase;

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
			this.pushToTrunk(sequenceNumber, newCommit);
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
			this.pushToTrunk(sequenceNumber, {
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

	private pushToTrunk(
		sequenceNumber: SeqNumber,
		commit: Commit<TChangeset>,
		local = false,
	): void {
		this.trunk.setHead(mintCommit(this.trunk.getHead(), commit));
		const trunkHead = this.trunk.getHead();
		if (local) {
			const type =
				this.localBranchUndoRedoManager.getCommitType(trunkHead.revision) ??
				fail("Local commit types must be tracked until they are sequenced.");

			this.trunkUndoRedoManager.trackCommit(trunkHead, type);
		}
		this.trunk.repairDataStoreProvider?.applyChange(commit.change);
		this.sequenceMap.set(sequenceNumber, trunkHead);
		this.trunkMetadata.set(trunkHead.revision, { sequenceNumber, sessionId: commit.sessionId });
		this.events.emit("newTrunkHead", trunkHead);
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

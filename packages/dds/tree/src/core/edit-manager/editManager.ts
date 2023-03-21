/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import BTree from "sorted-btree";
import { assert } from "@fluidframework/common-utils";
import { ChangeFamily } from "../change-family";
import { SimpleDependee } from "../dependency-tracking";
import { AnchorSet, Delta, emptyDelta } from "../tree";
import {
	brand,
	Brand,
	fail,
	getOrCreate,
	mapIterable,
	Mutable,
	RecursiveReadonly,
	zipIterables,
} from "../../util";
import {
	findAncestor,
	findCommonAncestor,
	mintCommit,
	GraphCommit,
	RevisionTag,
	SessionId,
	Rebaser,
	assertIsRevisionTag,
	mintRevisionTag,
	tagChange,
	TaggedChange,
} from "../rebase";
import { ReadonlyRepairDataStore } from "../repair";

export interface Commit<TChangeset> extends Omit<GraphCommit<TChangeset>, "parent"> {}
export type SeqNumber = Brand<number, "edit-manager.SeqNumber">;
export const minimumPossibleSequenceNumber: SeqNumber = brand(Number.MIN_SAFE_INTEGER);

const nullRevisionTag = assertIsRevisionTag("00000000-0000-4000-8000-000000000000");

/**
 * Represents a local branch of a document and interprets the effect on the document of adding sequenced changes,
 * which were based on a given session's branch, to the document history
 */
// TODO: Try to reduce this to a single type parameter
export class EditManager<
	TChangeset,
	TChangeFamily extends ChangeFamily<any, TChangeset>,
> extends SimpleDependee {
	/**
	 * The head commit of the "trunk" branch. The trunk represents the list of received sequenced changes.
	 */
	private trunk: GraphCommit<TChangeset>;

	/**
	 * Branches are maintained to represent the local change list that the issuing client had
	 * at the time of submitting the latest known edit on the branch.
	 * This means the head commit of each branch is always in its original (non-rebased) form.
	 */
	private readonly peerLocalBranches: Map<SessionId, GraphCommit<TChangeset>> = new Map();

	/**
	 * This branch holds the changes made by this client which have not yet been confirmed as sequenced changes.
	 */
	private localBranch: GraphCommit<TChangeset>;

	private minimumSequenceNumber: number = -1;

	private readonly rebaser: Rebaser<TChangeset>;

	/**
	 * A map from a sequence number to the commit in the trunk which has that sequence number
	 */
	private readonly sequenceMap = new BTree<SeqNumber, GraphCommit<TChangeset>>();

	/**
	 * An immutable "origin" commit singleton on which the trunk is based.
	 * This makes it possible to model the trunk in the same way as any other branch
	 * (it branches off of a base commit) which simplifies some logic.
	 */
	private readonly trunkBase: GraphCommit<TChangeset>;

	public constructor(
		public readonly changeFamily: TChangeFamily,
		// TODO: Change this type to be the Session ID type provided by the IdCompressor when available.
		public readonly localSessionId: SessionId,
		public readonly anchors?: AnchorSet,
	) {
		super("EditManager");
		this.rebaser = new Rebaser(changeFamily.rebaser);
		this.trunkBase = {
			revision: nullRevisionTag,
			sessionId: "",
			change: changeFamily.rebaser.compose([]),
		};
		this.trunk = this.trunkBase;
		this.localBranch = this.trunk;
	}

	/**
	 * Advances the minimum sequence number, and removes all commits from the trunk which lie outside the collaboration window.
	 * @param minimumSequenceNumber - the minimum sequence number for all of the connected clients
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

		const newTrunkTail = this.sequenceMap.getPairOrNextHigher(minimumSequenceNumber)?.[1];
		this.sequenceMap.deleteRange(minimumPossibleSequenceNumber, minimumSequenceNumber, false);

		if (newTrunkTail !== undefined) {
			// This is dangerous. Commits ought to be immutable, but if they are then changing the trunk tail requires
			// regenerating the entire commit graph. It is, in general, safe to chop off the tail like this if we know
			// that there are no outstanding references to any of the commits being removed. For example, there must be
			// no existing branches that are based off of any of the commits being removed.
			(newTrunkTail as Mutable<GraphCommit<TChangeset>>).parent = this.trunkBase;

			for (const [sessionId, branch] of this.peerLocalBranches) {
				// If a session branch falls behind the min sequence number, then we know that it has been abandoned by Fluid
				// (because otherwise, it would have already been updated) and we should not receive any more updates for it.
				if (findCommonAncestor(branch, this.trunkBase) === undefined) {
					this.peerLocalBranches.delete(sessionId);
				}
			}

			// TODO: when arbitrary local branching is added, the local branches will need to be considered here as well
		}
	}

	public isEmpty(): boolean {
		return (
			this.trunk === this.trunkBase &&
			this.peerLocalBranches.size === 0 &&
			this.localBranch === this.trunk
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
			this.localBranch === this.trunk,
			0x428 /* Clients with local changes cannot be used to generate summaries */,
		);

		const trunkPath = getPathFromBase(this.trunk, this.trunkBase);
		assert(
			this.sequenceMap.size === trunkPath.length,
			0x572 /* Expected sequence map to be the same size as the trunk */,
		);
		const trunk = Array.from(
			mapIterable(
				zipIterables(this.sequenceMap.keys(), trunkPath),
				([sequenceNumber, commit]) => ({ ...commit, sequenceNumber }),
			),
		);

		const branches = new Map<SessionId, SummarySessionBranch<TChangeset>>(
			mapIterable(this.peerLocalBranches.entries(), ([sessionId, branch]) => {
				const branchPath: GraphCommit<TChangeset>[] = [];
				const ancestor =
					findCommonAncestor([branch, branchPath], this.trunk) ??
					fail("Expected branch to be based on trunk");

				return [
					sessionId,
					{
						base: ancestor.revision,
						commits: branchPath,
					},
				];
			}),
		);

		return { trunk, branches };
	}

	public loadSummaryData(data: SummaryData<TChangeset>): void {
		this.sequenceMap.clear();
		this.trunk = data.trunk.reduce((base, c) => {
			const commit = mintCommit(base, c);
			this.sequenceMap.set(c.sequenceNumber, commit);
			return commit;
		}, this.trunkBase);

		this.localBranch = this.trunk;
		this.peerLocalBranches.clear();

		for (const [sessionId, branch] of data.branches) {
			const commit =
				findAncestor(this.trunk, (r) => r.revision === branch.base) ??
				fail("Expected summary branch to be based off of a revision in the trunk");

			this.peerLocalBranches.set(sessionId, branch.commits.reduce(mintCommit, commit));
		}
	}

	public getTrunk(): readonly RecursiveReadonly<Commit<TChangeset>>[] {
		return getPathFromBase(this.trunk, this.trunkBase);
	}

	public getLastSequencedChange(): TChangeset {
		return (this.getLastCommit() ?? fail("No sequenced changes")).change;
	}

	public getLastCommit(): Commit<TChangeset> | undefined {
		return this.trunk;
	}

	/**
	 * @returns the head commit of the local branch
	 */
	public getLocalBranchHead(): GraphCommit<TChangeset> {
		return this.localBranch;
	}

	public getLocalChanges(): readonly RecursiveReadonly<TChangeset>[] {
		return getPathFromBase(this.localBranch, this.trunk).map((c) => c.change);
	}

	public addSequencedChange(
		newCommit: Commit<TChangeset>,
		sequenceNumber: SeqNumber,
		referenceSequenceNumber: SeqNumber,
	): Delta.Root {
		if (newCommit.sessionId === this.localSessionId) {
			// `newCommit` should correspond to the oldest change in `localChanges`, so we move it into trunk.
			// `localChanges` are already rebased to the trunk, so we can use the stored change instead of rebasing the
			// change in the incoming commit.
			const localPath = getPathFromBase(this.localBranch, this.trunk);
			// Get the first revision in the local branch, and then remove it
			const { change } =
				localPath.shift() ??
				fail(
					"Received a sequenced change from the local session despite having no local changes",
				);
			this.pushToTrunk(sequenceNumber, { ...newCommit, change });
			// TODO: Can this be optimized by simply mutating the localPath parent pointers? Is it safe to do that?
			this.localBranch = localPath.reduce(mintCommit, this.trunk);
			return emptyDelta;
		}

		// Get the revision that the remote change is based on
		const baseRevisionInTrunk =
			this.sequenceMap.getPairOrNextLower(referenceSequenceNumber)?.[1] ?? this.trunkBase;

		// Rebase that branch over the part of the trunk up to the base revision
		// This will be a no-op if the sending client has not advanced since the last time we received an edit from it
		const [rebasedBranch] = this.rebaser.rebaseBranch(
			getOrCreate(this.peerLocalBranches, newCommit.sessionId, () => baseRevisionInTrunk),
			baseRevisionInTrunk,
			this.trunk,
		);

		if (rebasedBranch === this.trunk) {
			// If the branch is fully caught up and empty after being rebased, then push to the trunk directly
			this.pushToTrunk(sequenceNumber, newCommit);
			this.peerLocalBranches.set(newCommit.sessionId, this.trunk);
		} else {
			const newChangeFullyRebased = this.rebaser.rebaseChange(
				newCommit.change,
				rebasedBranch,
				this.trunk,
			);

			this.peerLocalBranches.set(newCommit.sessionId, mintCommit(rebasedBranch, newCommit));

			this.pushToTrunk(sequenceNumber, {
				...newCommit,
				change: newChangeFullyRebased,
			});
		}

		return this.changeFamily.intoDelta(this.rebaseLocalBranchOverTrunk());
	}

	public addLocalChange(
		revision: RevisionTag,
		change: TChangeset,
		rebaseAnchors = true,
	): Delta.Root {
		this.pushToLocalBranch(revision, change);

		if (rebaseAnchors && this.anchors !== undefined) {
			this.changeFamily.rebaser.rebaseAnchors(this.anchors, change);
		}

		return this.changeFamily.intoDelta(change);
	}

	/**
	 * Given a revision on the local branch, replace all commits after it with a single commit containing
	 * an equivalent composition of changes.
	 * @returns the new commit (which is now the head of the local branch)
	 */
	public squashLocalChanges(startRevision: RevisionTag): Commit<TChangeset> {
		const [squashStart, commits] = this.findLocalCommit(startRevision);
		// Anonymize the commits from this transaction by stripping their revision tags.
		// Otherwise, the change rebaser will record their tags and those tags no longer exist.
		const anonymousCommits = commits.map(({ change }) => ({ change, revision: undefined }));

		{
			const change = this.changeFamily.rebaser.compose(anonymousCommits);
			this.localBranch = mintCommit(squashStart, {
				revision: mintRevisionTag(),
				sessionId: this.localSessionId,
				change,
			});
			return this.localBranch;
		}
	}

	/**
	 * Given a revision on the local branch, remove all commits after it, and updates anchors accordingly.
	 * @param startRevision - the revision on the local branch that will become the new head
	 * @param repairStore - an optional repair data store to assist with generating inverses of the removed commits
	 * @returns a delta that describes the change from rolling back all of the removed commits.
	 */
	public rollbackLocalChanges(
		startRevision: RevisionTag,
		repairStore?: ReadonlyRepairDataStore,
	): Delta.Root {
		const [rollbackTo, commits] = this.findLocalCommit(startRevision);
		this.localBranch = rollbackTo;

		const inverses: TaggedChange<TChangeset>[] = [];
		for (let i = commits.length - 1; i >= 0; i--) {
			const { change, revision } = commits[i];
			const inverse = this.changeFamily.rebaser.invert(
				tagChange(change, revision),
				false,
				repairStore,
			);
			// We assign a revision tag to the inverse changesets so that the compose code can lookup the relative order
			// of individual changesets. These revisions don't actually make it to the document history.
			inverses.push(tagChange(inverse, mintRevisionTag()));
		}
		const composedInverse = this.changeFamily.rebaser.compose(inverses);
		if (this.anchors !== undefined) {
			this.changeFamily.rebaser.rebaseAnchors(this.anchors, composedInverse);
		}
		return this.changeFamily.intoDelta(composedInverse);
	}

	private findLocalCommit(
		revision: RevisionTag,
	): [commit: GraphCommit<TChangeset>, commitsAfter: GraphCommit<TChangeset>[]] {
		const commits: GraphCommit<TChangeset>[] = [];
		const commit = findAncestor([this.localBranch, commits], (c) => c.revision === revision);
		assert(commit !== undefined, 0x599 /* Expected local branch to contain revision */);
		return [commit, commits];
	}

	private pushToTrunk(sequenceNumber: SeqNumber, commit: Commit<TChangeset>): void {
		this.trunk = mintCommit(this.trunk, commit);
		this.sequenceMap.set(sequenceNumber, this.trunk);
	}

	private pushToLocalBranch(revision: RevisionTag, change: TChangeset): void {
		this.localBranch = mintCommit(this.localBranch, {
			revision,
			sessionId: this.localSessionId,
			change,
		});
	}

	private rebaseLocalBranchOverTrunk(): TChangeset {
		const [newLocalChanges, netChange] = this.rebaser.rebaseBranch(
			this.localBranch,
			this.trunk,
		);

		this.localBranch = newLocalChanges;

		if (this.anchors !== undefined) {
			this.changeFamily.rebaser.rebaseAnchors(this.anchors, netChange);
		}

		return netChange;
	}
}

export interface SequencedCommit<TChangeset> extends Commit<TChangeset> {
	sequenceNumber: SeqNumber;
}

/**
 * A branch off of the trunk for use in summaries
 */
export interface SummarySessionBranch<TChangeset> {
	readonly base: RevisionTag;
	readonly commits: Commit<TChangeset>[];
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
function getPathFromBase<TChange>(
	branchHead: GraphCommit<TChange>,
	baseBranchHead: GraphCommit<TChange>,
): GraphCommit<TChange>[] {
	const path: GraphCommit<TChange>[] = [];
	assert(
		findCommonAncestor([branchHead, path], baseBranchHead) !== undefined,
		0x573 /* Expected branches to be related */,
	);
	return path;
}

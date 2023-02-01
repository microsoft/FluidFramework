/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ChangeFamily } from "../change-family";
import { TaggedChange, RevisionTag, tagChange, tagInverse } from "../rebase";
import { SimpleDependee } from "../dependency-tracking";
import { AnchorSet, Delta, emptyDelta } from "../tree";
import { brand, Brand, fail, RecursiveReadonly } from "../../util";

export interface Commit<TChangeset> {
	sessionId: SessionId;
	seqNumber: SeqNumber;
	refNumber: SeqNumber;
	changeset: TChangeset;
}

export type SeqNumber = Brand<number, "edit-manager.SeqNumber">;
export type SessionId = string;

/**
 * Represents a local branch of a document and interprets the effect on the document of adding sequenced changes,
 * which were based on a given session's branch, to the document history
 */
// TODO: Remove commits when they are no longer in the collab window
// TODO: Try to reduce this to a single type parameter
// TODO: Move logic into Rebaser if possible
export class EditManager<
	TChangeset,
	TChangeFamily extends ChangeFamily<any, TChangeset>,
> extends SimpleDependee {
	// The trunk represents the list of received sequenced changes.
	// The change in each commit is rebased onto the previous change in the list.
	private readonly trunk: Commit<TChangeset>[] = [];
	/**
	 * Branches are maintained to represent the local change list that the issuing client would have had
	 * at the time of submitting the last edit on the branch.
	 * This means the last change on a branch is always in its original (non-rebased) form.
	 */
	private readonly branches: Map<SessionId, Branch<TChangeset>> = new Map();
	// This is the ordered list of changes made by this client which have not yet been confirmed as sequenced changes.
	// The first change in this list is based on the last change in the trunk.
	// Every other change in this list is based on the change preceding it.
	private localChanges: TaggedChange<TChangeset>[] = [];

	// Because we do not have sequence numbers for local changes, we assign them temporary revision tags.
	// We use negative numbers to avoid collisions with finalized revision tags.
	// TODO: Eventually we will have to send references to local revision tag (e.g. when undoing a local change)
	private nextLocalRevision = -1;

	private localSessionId?: SessionId;

	private minimumSequenceNumber: number = -1;

	public readonly computationName: string = "EditManager";

	public constructor(
		public readonly changeFamily: TChangeFamily,
		public readonly anchors?: AnchorSet,
	) {
		super();
	}

	/**
	 * Advances the minimum sequence number, and removes all commits from the trunk which lie outside the collaboration window.
	 * @param minimumSequenceNumber - the minimum sequence number for all of the connected clients
	 */
	public advanceMinimumSequenceNumber(minimumSequenceNumber: number): void {
		assert(
			minimumSequenceNumber >= this.minimumSequenceNumber,
			0x476 /* number must be larger or equal to current minimumSequenceNumber. */,
		);
		this.minimumSequenceNumber = minimumSequenceNumber;
		let commitsToRemove = 0;
		while (
			commitsToRemove < this.trunk.length &&
			this.trunk[commitsToRemove].seqNumber < minimumSequenceNumber
		) {
			commitsToRemove += 1;
		}
		this.trunk.splice(0, commitsToRemove);
	}

	/**
	 * Sets the ID that uniquely identifies the session for the document being edited.
	 * This function must be called before new changes (local or sequenced) are fed to this `EditManager`.
	 * This function must be called exactly once.
	 * @param id - The ID for the session associated with this `EditManager` instance.
	 */
	public initSessionId(id: SessionId): void {
		assert(
			this.localSessionId === undefined,
			0x427 /* The session ID should only be set once */,
		);
		this.localSessionId = id;
	}

	public isEmpty(): boolean {
		return (
			this.trunk.length === 0 && this.branches.size === 0 && this.localChanges.length === 0
		);
	}

	public getSummaryData(): ReadonlySummaryData<TChangeset> {
		// The assert below is acceptable at present because summarization only ever occurs on a client with no
		// local/in-flight changes.
		// In the future we may wish to relax this constraint. For that to work, the current implementation of
		// `EditManager` would have to be amended in one of two ways:
		// A) Changes made by the local session should be represented by a branch in `EditManager.branches`.
		// B) The contents of such a branch should be computed on demand based on the trunk.
		// Note that option (A) would be a simple change to `addSequencedChange` whereas (B) would likely require
		// rebasing trunk changes over the inverse of trunk changes.
		assert(
			this.localChanges.length === 0,
			0x428 /* Clients with local changes cannot be used to generate summaries */,
		);
		return { trunk: this.trunk, branches: this.branches };
	}

	public loadSummaryData(writer: (data: MutableSummaryData<TChangeset>) => void): void {
		writer({ trunk: this.trunk, branches: this.branches });
	}

	public getTrunk(): readonly RecursiveReadonly<Commit<TChangeset>>[] {
		return this.trunk;
	}

	public getLastSequencedChange(): TChangeset {
		return (this.getLastCommit() ?? fail("No sequenced changes")).changeset;
	}

	public getLastCommit(): Commit<TChangeset> | undefined {
		return this.trunk[this.trunk.length - 1];
	}

	public getLocalChanges(): readonly RecursiveReadonly<TChangeset>[] {
		return this.localChanges.map((change) => change.change);
	}

	public addSequencedChange(newCommit: Commit<TChangeset>): Delta.Root {
		assert(
			this.localSessionId !== undefined,
			0x429 /* The session ID should be set before processing changes */,
		);

		if (this.trunk.length > 0) {
			const lastSeqNumber = this.trunk[this.trunk.length - 1].seqNumber;
			assert(
				newCommit.seqNumber > lastSeqNumber,
				0x3a2 /* Incoming remote op sequence# <= local collabWindow's currentSequence# */,
			);
		}
		if (newCommit.sessionId === this.localSessionId) {
			// `newCommit` should correspond to the oldest change in `localChanges`, so we move it into trunk.
			// `localChanges` are already rebased to the trunk, so we can use the stored change instead of rebasing the
			// change in the incoming commit.
			const change = this.localChanges.shift() ?? fail(UNEXPECTED_SEQUENCED_LOCAL_EDIT);

			// TODO: The local change may contain references to local revision tags.
			// When other clients rebase this change, they will instead use the corresponding sequence numbers
			// instead of this client's local revision numbers. Although this need not inherently cause a divergence
			// in the state of the document, this is potentially dangerous.
			// This could be solved by one of the following approaches:
			// A) Maintain a `Branch` of sequenced changes from this client in addition to `localChanges`,
			//    and only use the rebased changes from that branch when adding to the trunk.
			// B) Use a UUID as the revision tag for each changeset instead of a sequence number,
			//    so that we do not need local revision tags.
			// C) Strip any references to local changes before adding the change to the trunk.
			//    This would also have to be done on each branch with references to changes local to that branch.
			this.trunk.push({
				...newCommit,
				changeset: change.change,
			});
			return emptyDelta;
		}

		const branch = this.getOrCreateBranch(newCommit.sessionId, newCommit.refNumber);

		// Like `newCommit.refNumber` but takes into account cases where the commit comes from a peer whose
		// prior changes made it to the trunk without requiring any rebasing.
		const effectiveNewCommitRef: SeqNumber = brand(
			Math.max(branch.refSeq, newCommit.refNumber),
		);

		this.updateBranch(branch, effectiveNewCommitRef);
		const newChangeFullyRebased = this.rebaseChangeFromBranchToTrunk(newCommit, branch);
		if (
			this.trunk.length > 0 &&
			effectiveNewCommitRef !== this.trunk[this.trunk.length - 1].seqNumber
		) {
			// The change diverges from the trunk
			branch.localChanges.push(newCommit);
		} else {
			// The change is in line with the trunk
			assert(
				branch.localChanges.length === 0,
				0x4c2 /* A branch whose latest commit is in line with the trunk should be empty */,
			);
			// We record that the peer session's commits are up to date with the current trunk tip.
			// This will be leveraged to compute `effectiveNewCommitRef` when receiving the next change from
			// that same peer session.
			branch.refSeq = newCommit.seqNumber;
		}

		// Note: we never use the refNumber of a commit in the trunk
		this.trunk.push({
			...newCommit,
			changeset: newChangeFullyRebased,
		});

		return this.changeFamily.intoDelta(
			this.rebaseLocalBranch(tagChange(newChangeFullyRebased, brand(newCommit.seqNumber))),
		);
	}

	public addLocalChange(change: TChangeset): Delta.Root {
		assert(
			this.localSessionId !== undefined,
			0x42a /* The session ID should be set before processing changes */,
		);

		this.localChanges.push(tagChange(change, this.allocateLocalRevisionTag()));

		if (this.anchors !== undefined) {
			this.changeFamily.rebaser.rebaseAnchors(this.anchors, change);
		}

		return this.changeFamily.intoDelta(change);
	}

	private rebaseChangeFromBranchToTrunk(
		commitToRebase: Commit<TChangeset>,
		branch: Branch<TChangeset>,
	): TChangeset {
		const changeRebasedToRef = branch.localChanges.reduceRight(
			(newChange, branchCommit) =>
				this.changeFamily.rebaser.rebase(newChange, this.inverseFromCommit(branchCommit)),
			commitToRebase.changeset,
		);

		return this.rebaseOverCommits(changeRebasedToRef, this.getCommitsAfter(branch.refSeq));
	}

	// TODO: Try to share more logic between this method and `rebaseBranch`
	private rebaseLocalBranch(trunkChange: TaggedChange<TChangeset>): TChangeset {
		const newBranchChanges: TaggedChange<TChangeset>[] = [];
		const inverses: TaggedChange<TChangeset>[] = [];

		for (const localChange of this.localChanges) {
			let change = this.rebaseChange(localChange.change, inverses);
			change = this.changeFamily.rebaser.rebase(change, trunkChange);
			change = this.rebaseChange(change, newBranchChanges);

			newBranchChanges.push({ ...localChange, change });

			const inverse = this.changeFamily.rebaser.invert(localChange);
			inverses.unshift(tagInverse(inverse, localChange.revision));
		}

		// This approach can lead to non-minimal changesets (and therefore deltas) for local inserts because
		// the rebased local insert does not cancel out with its inverse during composition.
		const netChange = this.changeFamily.rebaser.compose([
			...inverses,
			trunkChange,
			...newBranchChanges,
		]);

		if (this.anchors !== undefined) {
			this.changeFamily.rebaser.rebaseAnchors(this.anchors, netChange);
		}

		this.localChanges = newBranchChanges;

		return netChange;
	}

	/**
	 * Updates the `branch` to reflect the local changes that the session owner would have had after
	 * they learned of the commit with sequence number `newRef` being sequenced.
	 * This is accomplished by rebasing the branch's changes over any new trunk changes up to and including `newRef`.
	 * Changes with sequence number less than or equal to `newRef` are removed from the branch,
	 * since they are now part of the trunk this branch is based on.
	 * @param branch - The branch to update.
	 * @param newRef - The point in the trunk to rebase the branch up to.
	 */
	private updateBranch(branch: Branch<TChangeset>, newRef: SeqNumber) {
		const trunkChanges = this.getCommitsAfterAndUpToInclusive(branch.refSeq, newRef);
		if (trunkChanges.length === 0) {
			// This early return avoids rebasing the branch changes over an empty sandwich.
			return;
		}
		const newBranchChanges: Commit<TChangeset>[] = [];
		const inverses: TaggedChange<TChangeset>[] = [];

		let nextTempRevision = -1;
		for (const commit of branch.localChanges) {
			if (commit.seqNumber > newRef) {
				let change = this.rebaseChange(commit.changeset, inverses);
				change = this.rebaseOverCommits(change, trunkChanges);
				change = this.rebaseOverCommits(change, newBranchChanges);

				newBranchChanges.push({
					...commit,
					changeset: change,
				});
			}

			inverses.unshift(
				tagChange(
					this.changeFamily.rebaser.invert(taggedChangeFromCommit(commit)),
					brand(nextTempRevision--),
				),
			);
		}

		branch.localChanges = newBranchChanges;
		branch.refSeq = newRef;
	}

	private rebaseOverCommits(changeToRebase: TChangeset, commits: Commit<TChangeset>[]) {
		return this.rebaseChange(changeToRebase, commits.map(taggedChangeFromCommit));
	}

	private rebaseChange(
		changeToRebase: TChangeset,
		changesToRebaseOver: TaggedChange<TChangeset>[],
	) {
		return changesToRebaseOver.reduce(
			(a, b) => this.changeFamily.rebaser.rebase(a, b),
			changeToRebase,
		);
	}

	/**
	 * @param pred - The sequence number of the commit immediately before the commits of interest.
	 * @param last - The sequence number of the last commit of interest.
	 * @returns The trunk commits with sequence numbers greater than `pred` and smaller or equal to `last`,
	 * ordered in sequencing order.
	 */
	private getCommitsAfterAndUpToInclusive(
		pred: SeqNumber,
		last: SeqNumber,
	): Commit<TChangeset>[] {
		// This check is just a fast-path for the common case where no concurrent edits occurred.
		if (pred === last) {
			return [];
		}
		const firstIndex = this.getCommitIndexAfter(pred);
		const lastIndex = this.getCommitIndexAfter(last);
		return this.trunk.slice(firstIndex, lastIndex);
	}

	/**
	 * @param pred - The sequence number of the commit immediately before the commits of interest.
	 * @returns The trunk commits with sequence numbers greater than `pred`
	 */
	private getCommitsAfter(pred: SeqNumber): Commit<TChangeset>[] {
		const firstIndex = this.getCommitIndexAfter(pred);
		return this.trunk.slice(firstIndex);
	}

	/**
	 * @param seqNumber - The sequence number of an operation.
	 * It is acceptable for the trunk not to contain a commit with that sequence number.
	 * @returns The index of the earliest commit with a sequence number greater than `seqNumber`.
	 * Note that such a commit is not guaranteed to exist in the trunk
	 * (i.e. the return value may be equal to the length of the trunk).
	 */
	private getCommitIndexAfter(seqNumber: SeqNumber): number {
		for (let index = this.trunk.length - 1; index >= 0; --index) {
			if (this.trunk[index].seqNumber <= seqNumber) {
				return index + 1;
			}
		}
		return 0;
	}

	private getOrCreateBranch(sessionId: SessionId, refSeq: SeqNumber): Branch<TChangeset> {
		if (!this.branches.has(sessionId)) {
			this.branches.set(sessionId, { localChanges: [], refSeq });
		}
		return this.branches.get(sessionId) as Branch<TChangeset>;
	}

	private inverseFromCommit(commit: Commit<TChangeset>): TaggedChange<TChangeset> {
		return tagInverse(
			this.changeFamily.rebaser.invert(taggedChangeFromCommit(commit)),
			brand(commit.seqNumber),
		);
	}

	private allocateLocalRevisionTag(): RevisionTag {
		return brand(this.nextLocalRevision--);
	}
}

function taggedChangeFromCommit<T>(commit: Commit<T>): TaggedChange<T> {
	return tagChange(commit.changeset, brand(commit.seqNumber));
}

export interface Branch<TChangeset> {
	localChanges: Commit<TChangeset>[];
	refSeq: SeqNumber;
}

const UNEXPECTED_SEQUENCED_LOCAL_EDIT =
	"Received a sequenced change from the local session despite having no local changes";

/**
 * The in-memory data that summaries contain.
 * Note that this interface gives mutable access to the data.
 * Passed to {@link loadSummary}.
 */
export interface MutableSummaryData<TChangeset> {
	readonly trunk: Commit<TChangeset>[];
	readonly branches: Map<SessionId, Branch<TChangeset>>;
}

/**
 * The in-memory data that summaries contain.
 * Passed to {@link encodeSummary}.
 */
export interface ReadonlySummaryData<TChangeset> {
	readonly trunk: readonly Readonly<Commit<TChangeset>>[];
	readonly branches: ReadonlyMap<SessionId, Readonly<Branch<TChangeset>>>;
}

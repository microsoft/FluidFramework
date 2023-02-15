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
} from "../rebase";

export interface Commit<TChangeset> extends Omit<GraphCommit<TChangeset>, "parent"> {}
export type SeqNumber = Brand<number, "edit-manager.SeqNumber">;
export const minimumPossibleSequenceNumber: SeqNumber = brand(Number.MIN_SAFE_INTEGER);

const nullRevisionTag = assertIsRevisionTag("00000000-0000-4000-8000-000000000000");

// The EditManager

/**
 * Represents a local branch of a document and interprets the effect on the document of adding sequenced changes,
 * which were based on a given session's branch, to the document history
 */
// TODO: Try to reduce this to a single type parameter
export class EditManager<
	TChangeset,
	TChangeFamily extends ChangeFamily<any, TChangeset>,
> extends SimpleDependee {
	/** The trunk represents the list of received sequenced changes. */
	private trunk: GraphCommit<TChangeset>;

	/**
	 * Branches are maintained to represent the local change list that the issuing client had
	 * at the time of submitting the latest known edit on the branch.
	 * This means the head of one of these branches is always in its original (non-rebased) form.
	 */
	private readonly sessionLocalBranches: Map<SessionId, GraphCommit<TChangeset>> = new Map();

	/** This branch holds the changes made by this client which have not yet been confirmed as sequenced changes. */
	private localBranch: GraphCommit<TChangeset>;

	private localSessionId?: SessionId;

	private minimumSequenceNumber: number = -1;

	public readonly computationName: string = "EditManager";

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
		public readonly anchors?: AnchorSet,
	) {
		super();
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
		assert(
			minimumSequenceNumber >= this.minimumSequenceNumber,
			0x476 /* number must be larger or equal to current minimumSequenceNumber. */,
		);

		this.minimumSequenceNumber = minimumSequenceNumber;

		const newTrunk = this.sequenceMap.getPairOrNextHigher(minimumSequenceNumber)?.[1];
		this.sequenceMap.deleteRange(minimumPossibleSequenceNumber, minimumSequenceNumber, false);

		if (newTrunk !== undefined) {
			// TODO: This mutates the trunk, but commits should be immutable. Is this safe? How do we notify
			// branches off of the trunk of the garbage collected here? What do we do with this junk inside the trunk?
			(newTrunk as Mutable<GraphCommit<TChangeset>>).parent = this.trunkBase;
		}
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
			this.trunk === this.trunkBase &&
			this.sessionLocalBranches.size === 0 &&
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
			getPathFromBase(this.localBranch, this.trunk).length === 0,
			0x428 /* Clients with local changes cannot be used to generate summaries */,
		);

		const trunk = getPathFromBase(this.trunk, this.trunkBase);
		const branches = new Map<SessionId, SummarySessionBranch<TChangeset>>(
			mapIterable(this.sessionLocalBranches.entries(), ([sessionId, branch]) => {
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

		const sequenceMap = new Map(
			mapIterable(this.sequenceMap.entries(), ([n, r]) => [n, r.revision]),
		);

		return { trunk, branches, sequenceMap };
	}

	// This appends the given trunk commits to the trunk but overwrites the commits in branches.
	public appendSummaryData(data: SummaryData<TChangeset>): void {
		this.trunk = data.trunk.reduce(mintCommit, this.trunk);

		for (const [sessionId, branch] of data.branches) {
			const commit =
				findAncestor(this.trunk, (r) => r.revision === branch.base) ??
				fail("Expected summary branch to be based off of a revision in the trunk");

			this.sessionLocalBranches.set(sessionId, branch.commits.reduce(mintCommit, commit));
		}

		for (const [sequenceNumber, revisionTag] of data.sequenceMap) {
			// TODO make this more efficient. Need a lookup table [revisionTag -> commit in trunk] in this class.
			// Or, if we decide that this function replaces the trunk instead of appending to it,
			// then we can generate a lookup table just above as we parse `data.trunk`
			this.sequenceMap.set(
				sequenceNumber,
				findAncestor(this.trunk, (r) => r.revision === revisionTag) ??
					fail("Expected to find sequenced revision in trunk"),
			);
		}

		this.rebaseLocalBranchOverTrunk();
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

	public getLocalChanges(): readonly RecursiveReadonly<TChangeset>[] {
		return getPathFromBase(this.localBranch, this.trunk).map((c) => c.change);
	}

	public addSequencedChange(
		newCommit: Commit<TChangeset>,
		sequenceNumber: SeqNumber,
		referenceSequenceNumber: SeqNumber,
	): Delta.Root {
		assert(
			this.localSessionId !== undefined,
			0x429 /* The session ID should be set before processing changes */,
		);

		if (newCommit.sessionId === this.localSessionId) {
			// `newCommit` should correspond to the oldest change in `localChanges`, so we move it into trunk.
			// `localChanges` are already rebased to the trunk, so we can use the stored change instead of rebasing the
			// change in the incoming commit.
			const localPath = getPathFromBase(this.localBranch, this.trunk);
			// Get the first revision in the local branch, and then remove it
			const { change } = localPath.shift() ?? fail(UNEXPECTED_SEQUENCED_LOCAL_EDIT);
			this.pushToTrunk(sequenceNumber, { ...newCommit, change });
			this.localBranch = localPath.reduce(mintCommit, this.trunk);
			return emptyDelta;
		}

		// Get the revision that the remote change is based on
		const baseRevisionInTrunk =
			this.sequenceMap.getPairOrNextLower(referenceSequenceNumber)?.[1] ?? this.trunkBase;

		// Rebase that branch over the part of the trunk up to the base revision
		// This will be a no-op if the sending client has not advanced since the last time we received an edit from it
		const [rebasedBranch] = this.rebaser.rebaseBranch(
			getOrCreate(this.sessionLocalBranches, newCommit.sessionId, () => baseRevisionInTrunk),
			this.trunk,
			baseRevisionInTrunk,
		);

		if (rebasedBranch === this.trunk) {
			// If the branch is fully caught up and empty after being rebased, then push to the trunk directly
			this.pushToTrunk(sequenceNumber, newCommit);
			this.sessionLocalBranches.set(newCommit.sessionId, this.trunk);
		} else {
			const newChangeFullyRebased = this.rebaser.rebaseChange(
				newCommit.change,
				rebasedBranch,
				this.trunk,
			);

			this.sessionLocalBranches.set(
				newCommit.sessionId,
				mintCommit(rebasedBranch, newCommit),
			);

			this.pushToTrunk(sequenceNumber, {
				...newCommit,
				change: newChangeFullyRebased,
			});
		}

		return this.changeFamily.intoDelta(this.rebaseLocalBranchOverTrunk());
	}

	public addLocalChange(revision: RevisionTag, change: TChangeset): Delta.Root {
		this.pushToLocalBranch(revision, change);

		if (this.anchors !== undefined) {
			this.changeFamily.rebaser.rebaseAnchors(this.anchors, change);
		}

		return this.changeFamily.intoDelta(change);
	}

	private pushToTrunk(sequenceNumber: SeqNumber, commit: Commit<TChangeset>): void {
		this.trunk = mintCommit(this.trunk, commit);
		this.sequenceMap.set(sequenceNumber, this.trunk);
	}

	private pushToLocalBranch(revision: RevisionTag, change: TChangeset): void {
		assert(
			this.localSessionId !== undefined,
			0x42a /* The session ID should be set before processing changes */,
		);

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

const UNEXPECTED_SEQUENCED_LOCAL_EDIT =
	"Received a sequenced change from the local session despite having no local changes";

/** A branch off of the trunk for use in summaries */
export interface SummarySessionBranch<TChangeset> {
	readonly base: RevisionTag;
	readonly commits: Commit<TChangeset>[];
}

/** The in-memory data that summaries contain */
export interface SummaryData<TChangeset> {
	readonly trunk: readonly Commit<TChangeset>[];
	readonly branches: ReadonlyMap<SessionId, SummarySessionBranch<TChangeset>>;
	readonly sequenceMap: ReadonlyMap<SeqNumber, RevisionTag>;
}

/** @returns the path from the base of a branch to its head */
function getPathFromBase<TChange>(
	branchHead: GraphCommit<TChange>,
	baseBranchHead: GraphCommit<TChange>,
): GraphCommit<TChange>[] {
	const path: GraphCommit<TChange>[] = [];
	assert(
		findCommonAncestor([branchHead, path], baseBranchHead) !== undefined,
		"Expected branches to be related",
	);
	return path;
}

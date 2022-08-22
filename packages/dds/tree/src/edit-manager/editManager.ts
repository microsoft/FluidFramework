/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ChangeFamily } from "../change-family";
import { AnchorSet, Delta } from "../tree";
import { Brand, fail, RecursiveReadonly } from "../util";

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
export class EditManager<TChangeset, TChangeFamily extends ChangeFamily<any, TChangeset>> {
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
    private localChanges: TChangeset[] = [];
    private localSessionId: SessionId | undefined;

    public constructor(
        public readonly changeFamily: TChangeFamily,
        public readonly anchors?: AnchorSet,
    ) { }

    public setLocalSessionId(id: SessionId) {
        assert(this.localSessionId === undefined || this.localSessionId === id, "Local session ID cannot be changed");
        this.localSessionId = id;
    }

    public getTrunk(): readonly RecursiveReadonly<Commit<TChangeset>>[] {
        return this.trunk;
    }

    public getLastSequencedChange(): TChangeset {
        return this.trunk[this.trunk.length - 1].changeset;
    }

    public getLocalChanges(): readonly RecursiveReadonly<TChangeset>[] {
        return this.localChanges;
    }

    public addSequencedChange(newCommit: Commit<TChangeset>): Delta.Root {
        if (this.trunk.length > 0) {
            const lastSeqNumber = this.trunk[this.trunk.length - 1].seqNumber;
            assert(
                newCommit.seqNumber > lastSeqNumber,
                "Incoming remote op sequence# <= local collabWindow's currentSequence#",
            );
        }
        if (newCommit.sessionId === this.localSessionId) {
            // `newCommit` should correspond to the oldest change in `localChanges`, so we move it into trunk.
            // `localChanges` are already rebased to the trunk, so we can use the stored change instead of rebasing the
            // change in the incoming commit.
            const changeset = this.localChanges.shift() ?? fail(UNEXPECTED_SEQUENCED_LOCAL_EDIT);
            this.trunk.push({
                ...newCommit,
                changeset,
            });
            return Delta.empty;
        }

        const branch = this.getOrCreateBranch(newCommit.sessionId, newCommit.refNumber);
        this.updateBranch(branch, newCommit.refNumber);
        const newChangeFullyRebased = this.rebaseChangeFromBranchToTrunk(newCommit.changeset, branch);

        // Note: we never use the refNumber of a commit in the trunk
        this.trunk.push({
            ...newCommit,
            changeset: newChangeFullyRebased,
        });

        branch.localChanges.push(newCommit);

        return this.changeFamily.intoDelta(this.rebaseLocalBranch(newChangeFullyRebased));
    }

    public addLocalChange(change: TChangeset): Delta.Root {
        this.localChanges.push(change);

        if (this.anchors !== undefined) {
            this.changeFamily.rebaser.rebaseAnchors(this.anchors, change);
        }

        return this.changeFamily.intoDelta(change);
    }

    private rebaseChangeFromBranchToTrunk(changeToRebase: TChangeset, branch: Branch<TChangeset>): TChangeset {
        const changeRebasedToRef = branch.localChanges.reduceRight(
            (newChange, branchCommit) =>
                this.changeFamily.rebaser.rebase(newChange, this.changeFamily.rebaser.invert(branchCommit.changeset)),
            changeToRebase,
        );

        return this.rebaseOverCommits(changeRebasedToRef, this.getCommitsAfter(branch.refSeq));
    }

    // TODO: Try to share more logic between this method and `rebaseBranch`
    private rebaseLocalBranch(trunkChange: TChangeset): TChangeset {
        const newBranchChanges: TChangeset[] = [];
        const inverses: TChangeset[] = [];

        for (const localChange of this.localChanges) {
            let change = this.rebaseChange(localChange, inverses);
            change = this.changeFamily.rebaser.rebase(change, trunkChange);
            change = this.rebaseChange(change, newBranchChanges);

            newBranchChanges.push(change);

            inverses.unshift(this.changeFamily.rebaser.invert(localChange));
        }

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
            assert(branch.refSeq === newRef, "Expected trunk changes");
            // This early return avoids rebasing the branch changes over an empty sandwich.
            return;
        }
        const newBranchChanges: Commit<TChangeset>[] = [];
        const inverses: TChangeset[] = [];

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

            inverses.unshift(this.changeFamily.rebaser.invert(commit.changeset));
        }

        branch.localChanges = newBranchChanges;
        branch.refSeq = newRef;
    }

    private rebaseOverCommits(changeToRebase: TChangeset, commits: Commit<TChangeset>[]) {
        return this.rebaseChange(changeToRebase, commits.map((commit) => commit.changeset));
    }

    private rebaseChange(changeToRebase: TChangeset, changesToRebaseOver: TChangeset[]) {
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
    private getCommitsAfterAndUpToInclusive(pred: SeqNumber, last: SeqNumber): Commit<TChangeset>[] {
        // This check is not just a fast-path for the common case where no concurrent edits occurred;
        // it also serves to handle the case where `last` represents the initial state before any commits.
        if (pred === last) {
            return [];
        }
        // If there is no corresponding commit, we assume `pred` refers to initial state of the DDS.
        const firstIndex = (this.getCommitIndex(pred) ?? -1) + 1;
        const lastIndex = this.getCommitIndex(last) ?? fail("Unknown sequence number");
        return this.trunk.slice(firstIndex, lastIndex + 1);
    }

    /**
     * @param pred - The sequence number of the commit immediately before the commits of interest.
     * @returns The trunk commits with sequence numbers greater than `pred`
     */
    private getCommitsAfter(pred: SeqNumber): Commit<TChangeset>[] {
        // If there is no corresponding commit, we assume `pred` refers to initial state of the DDS.
        const firstIndex = (this.getCommitIndex(pred) ?? -1) + 1;
        return this.trunk.slice(firstIndex);
    }

    private getCommitIndex(seqNumber: SeqNumber): number | undefined {
        const index = this.trunk.findIndex((commit) => commit.seqNumber === seqNumber);
        return index === -1 ? undefined : index;
    }

    private getOrCreateBranch(sessionId: SessionId, refSeq: SeqNumber): Branch<TChangeset> {
        if (!this.branches.has(sessionId)) {
            this.branches.set(sessionId, { localChanges: [], refSeq });
        }
        return this.branches.get(sessionId) as Branch<TChangeset>;
    }
}

interface Branch<TChangeset> {
    localChanges: Commit<TChangeset>[];
    refSeq: SeqNumber;
}
const UNEXPECTED_SEQUENCED_LOCAL_EDIT =
    "Received a sequenced change from the local session despite having no local changes";

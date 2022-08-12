/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ChangeFamily } from "../change-family";
import { AnchorSet, Delta } from "../tree";
import { brand, Brand, fail, RecursiveReadonly } from "../util";

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
    private readonly trunk: Commit<TChangeset>[] = [];
    private readonly branches: Map<SessionId, Branch<TChangeset>> = new Map();
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
            const nextSeqNumber: SeqNumber = brand(lastSeqNumber as number + 1);
            assert(newCommit.seqNumber === nextSeqNumber,
                0x34a /* Expected incoming commit to be next sequenced commit */);
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
        this.rebaseBranch(branch, newCommit.refNumber);
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

        return this.rebaseOverCommits(changeRebasedToRef, this.getCommitsBetween(branch.refSeq, undefined));
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

    private rebaseBranch(branch: Branch<TChangeset>, newRef: SeqNumber) {
        const trunkChanges = this.getCommitsBetween(branch.refSeq, newRef);
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

    private getCommitsBetween(first: SeqNumber, last: SeqNumber | undefined): Commit<TChangeset>[] {
        const firstIndex = this.getCommitIndex(first);
        const lastIndex = last === undefined ? undefined : this.getCommitIndex(last);
        return this.trunk.slice(firstIndex, lastIndex);
    }

    private getCommitIndex(seqNumber: SeqNumber): number {
        return this.trunk.findIndex((commit) => commit.seqNumber === seqNumber);
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

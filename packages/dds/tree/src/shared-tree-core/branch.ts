/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { type TelemetryEventBatcher, measure } from "@fluidframework/telemetry-utils/internal";

import {
	type BranchRebaseResult,
	type ChangeFamily,
	type ChangeFamilyEditor,
	CommitKind,
	type GraphCommit,
	type RevisionTag,
	type TaggedChange,
	findAncestor,
	makeAnonChange,
	mintCommit,
	rebaseBranch,
	tagRollbackInverse,
	type RebaseStatsWithDuration,
} from "../core/index.js";
import type { Listenable } from "@fluidframework/core-interfaces";
import { createEmitter } from "@fluid-internal/client-utils";

import { hasSome, defineLazyCachedProperty } from "../util/index.js";

/**
 * Describes a change to a `SharedTreeBranch`. Each of the following event types provides a `change` which contains the net change to the branch (or is undefined if there was no net change):
 * * Append - when one or more commits are appended to the head of the branch, for example via
 * a change applied by the branch's editor, or as a result of merging another branch into this one
 * * Remove - when one or more commits are removed from the head of the branch.
 * * Rebase - when a rebase operation adds commits from another branch and replaces existing commits with their rebased versions.
 */
export type SharedTreeBranchChange<TChange> =
	| {
			type: "append";
			kind: CommitKind;
			change: TaggedChange<TChange>;
			/** The commits appended to the head of the branch by this operation */
			newCommits: readonly [GraphCommit<TChange>, ...GraphCommit<TChange>[]];
	  }
	| {
			type: "remove";
			change: TaggedChange<TChange>;
			/** The commits removed from the head of the branch by this operation */
			removedCommits: readonly [GraphCommit<TChange>, ...GraphCommit<TChange>[]];
	  }
	| {
			type: "rebase";
			change: TaggedChange<TChange> | undefined;
	  };

/**
 * The events emitted by a `SharedTreeBranch`
 */
export interface SharedTreeBranchEvents<TEditor extends ChangeFamilyEditor, TChange>
	extends BranchTrimmingEvents {
	/**
	 * Fired just before the head of this branch changes.
	 * @param change - the change to this branch's state and commits
	 */
	beforeChange(change: SharedTreeBranchChange<TChange>): void;

	/**
	 * Fired just after the head of this branch changes.
	 * @param change - the change to this branch's state and commits
	 */
	afterChange(change: SharedTreeBranchChange<TChange>): void;

	/**
	 * Fired when this branch forks
	 * @param fork - the new branch that forked off of this branch
	 */
	fork(fork: SharedTreeBranch<TEditor, TChange>): void;

	/**
	 * Fired after this branch is disposed
	 */
	dispose(): void;
}

/**
 * Events related to branch trimming.
 *
 * @remarks
 * Trimming is a very specific kind of mutation which is the only allowed mutations to branches.
 * References to commits from other commits are removed so that the commit objects can be GC'd by the JS engine.
 * This happens by changing a commit's parent property to undefined, which drops all commits that are in its "ancestry".
 * It is done as a performance optimization when it is determined that commits are no longer needed for future computation.
 */
export interface BranchTrimmingEvents {
	/**
	 * Fired when some contiguous range of commits beginning with the "global tail" of this branch are trimmed from the branch.
	 * This happens by deleting the parent pointer to the last commit in that range. This event can be fired at any time.
	 */
	ancestryTrimmed(trimmedRevisions: RevisionTag[]): void;
}

/**
 * A branch of changes that can be applied to a SharedTree.
 */
export class SharedTreeBranch<TEditor extends ChangeFamilyEditor, TChange> {
	readonly #events = createEmitter<SharedTreeBranchEvents<TEditor, TChange>>();
	public readonly events: Listenable<SharedTreeBranchEvents<TEditor, TChange>> = this.#events;
	public readonly editor: TEditor;
	private disposed = false;
	private readonly unsubscribeBranchTrimmer?: () => void;
	/**
	 * Construct a new branch.
	 * @param head - the head of the branch
	 * @param changeFamily - determines the set of changes that this branch can commit
	 * @param branchTrimmer - an optional event emitter that informs the branch it has been trimmed. If this is not supplied, then the branch must
	 * never be trimmed. See {@link BranchTrimmingEvents} for details on trimming.
	 */
	public constructor(
		private head: GraphCommit<TChange>,
		public readonly changeFamily: ChangeFamily<TEditor, TChange>,
		private readonly mintRevisionTag: () => RevisionTag,
		private readonly branchTrimmer?: Listenable<BranchTrimmingEvents>,
		private readonly telemetryEventBatcher?: TelemetryEventBatcher<
			keyof RebaseStatsWithDuration
		>,
	) {
		this.editor = this.changeFamily.buildEditor(mintRevisionTag, (change) =>
			this.apply(change),
		);
		this.unsubscribeBranchTrimmer = branchTrimmer?.on("ancestryTrimmed", (commit) => {
			this.#events.emit("ancestryTrimmed", commit);
		});
	}

	/**
	 * Sets the head of this branch.
	 * @remarks This is a "manual override" of sorts, for when the branch needs to be set to a certain state without going through the usual flow of edits.
	 * This might be necessary as a performance optimization, or to prevent parts of the system updating incorrectly (this method emits no change events!).
	 */
	public setHead(head: GraphCommit<TChange>): void {
		this.assertNotDisposed();
		this.head = head;
	}

	/**
	 * Apply a change to this branch.
	 * @param change - the change to apply
	 * @param kind - the kind of change to apply
	 * @returns the change that was applied and the new head commit of the branch
	 */
	public apply(change: TaggedChange<TChange>, kind: CommitKind = CommitKind.Default): void {
		this.assertNotDisposed();

		const revisionTag = change.revision;
		assert(revisionTag !== undefined, 0xa49 /* Revision tag must be provided */);

		const newHead = mintCommit(this.head, {
			revision: revisionTag,
			change: change.change,
		});

		const changeEvent = {
			type: "append",
			kind,
			change,
			newCommits: [newHead],
		} as const;

		this.#events.emit("beforeChange", changeEvent);
		this.head = newHead;
		this.#events.emit("afterChange", changeEvent);
	}

	/**
	 * @returns the commit at the head of this branch.
	 */
	public getHead(): GraphCommit<TChange> {
		return this.head;
	}

	/**
	 * Spawn a new branch that is based off of the current state of this branch.
	 * @param commit - The commit to base the new branch off of. Defaults to the head of this branch.
	 * @remarks Changes made to the new branch will not be applied to this branch until the new branch is {@link SharedTreeBranch.merge | merged} back in.
	 * Forks created during a transaction will be disposed when the transaction ends.
	 */
	public fork(commit: GraphCommit<TChange> = this.head): SharedTreeBranch<TEditor, TChange> {
		this.assertNotDisposed();
		const fork = new SharedTreeBranch(
			commit,
			this.changeFamily,
			this.mintRevisionTag,
			this.branchTrimmer,
		);
		this.#events.emit("fork", fork);
		return fork;
	}

	/**
	 * Rebase the changes that have been applied to this branch over divergent changes in the given branch.
	 * After this operation completes, this branch will be based off of `branch`.
	 *
	 * @param branch - the branch to rebase onto
	 * @param upTo - the furthest commit on `branch` over which to rebase (inclusive). Defaults to the head commit of `branch`.
	 * @returns the result of the rebase or undefined if nothing changed
	 */
	public rebaseOnto(
		branch: SharedTreeBranch<TEditor, TChange>,
		upTo = branch.getHead(),
	): void {
		this.assertNotDisposed();

		// Rebase this branch onto the given branch
		const rebaseResult = this.rebaseBranch(this, branch, upTo);
		if (rebaseResult === undefined) {
			return;
		}

		// The net change to this branch is provided by the `rebaseBranch` API
		const { newSourceHead, commits } = rebaseResult;
		const { deletedSourceCommits, targetCommits, sourceCommits } = commits;
		assert(hasSome(targetCommits), 0xa83 /* Expected commit(s) for a non no-op rebase */);

		const newCommits = targetCommits.concat(sourceCommits);
		const changeEvent = {
			type: "rebase",
			get change() {
				const change = rebaseResult.sourceChange;
				return change === undefined ? undefined : makeAnonChange(change);
			},
			removedCommits: deletedSourceCommits,
			newCommits,
		} as const;

		this.#events.emit("beforeChange", changeEvent);
		this.head = newSourceHead;
		this.#events.emit("afterChange", changeEvent);
	}

	/**
	 * Remove a range of commits from this branch.
	 * @param commit - All commits after (but not including) this commit will be removed.
	 * @returns The net change to this branch and the commits that were removed from this branch.
	 */
	public removeAfter(commit: GraphCommit<TChange>): void {
		if (commit === this.head) {
			return;
		}

		const removedCommits: GraphCommit<TChange>[] = [];
		const inverses: TaggedChange<TChange>[] = [];
		findAncestor([this.head, removedCommits], (c) => {
			// TODO: Pull this side effect out if/when more diverse ancestry walking helpers are available
			if (c !== commit) {
				const revision = this.mintRevisionTag();
				const inverse = this.changeFamily.rebaser.changeRevision(
					this.changeFamily.rebaser.invert(c, true, revision),
					revision,
					c.revision,
				);

				inverses.push(tagRollbackInverse(inverse, revision, c.revision));
				return false;
			}

			return true;
		});
		assert(hasSome(removedCommits), 0xa84 /* Commit must be in the branch's ancestry */);

		const change = makeAnonChange(this.changeFamily.rebaser.compose(inverses));
		const changeEvent = {
			type: "remove",
			change,
			removedCommits,
		} as const;

		this.#events.emit("beforeChange", changeEvent);
		this.head = commit;
		this.#events.emit("afterChange", changeEvent);
	}

	/**
	 * Apply all the divergent changes on the given branch to this branch.
	 *
	 * @param branch - the branch to merge into this branch
	 * @returns the net change to this branch and the commits that were added to this branch by the merge,
	 * or undefined if nothing changed
	 */
	public merge(branch: SharedTreeBranch<TEditor, TChange>): void {
		this.assertNotDisposed();
		branch.assertNotDisposed();

		if (branch === this) {
			return undefined;
		}

		// Rebase the given branch onto this branch
		const rebaseResult = this.rebaseBranch(branch, this);
		if (rebaseResult === undefined) {
			return undefined;
		}

		// Compute the net change to this branch
		const sourceCommits = rebaseResult.commits.sourceCommits;
		assert(hasSome(sourceCommits), 0xa86 /* Expected source commits in non no-op merge */);
		const { rebaser } = this.changeFamily;
		const changeEvent = defineLazyCachedProperty(
			{
				type: "append",
				kind: CommitKind.Default,
				newCommits: sourceCommits,
			} as const,
			"change",
			() => makeAnonChange(rebaser.compose(sourceCommits)),
		);

		this.#events.emit("beforeChange", changeEvent);
		this.head = rebaseResult.newSourceHead;
		this.#events.emit("afterChange", changeEvent);
	}

	/** Rebase `branchHead` onto `onto`, but return undefined if nothing changed */
	private rebaseBranch(
		branch: SharedTreeBranch<TEditor, TChange>,
		onto: SharedTreeBranch<TEditor, TChange>,
		upTo = onto.getHead(),
	): BranchRebaseResult<TChange> | undefined {
		const { head } = branch;
		if (head === upTo) {
			return undefined;
		}

		const { duration, output } = measure(() =>
			rebaseBranch(
				this.mintRevisionTag,
				this.changeFamily.rebaser,
				head,
				upTo,
				onto.getHead(),
			),
		);

		this.telemetryEventBatcher?.accumulateAndLog({ duration, ...output.telemetryProperties });

		if (this.head === output.newSourceHead) {
			return undefined;
		}

		return output;
	}

	/**
	 * Dispose this branch, freezing its state.
	 *
	 * @remarks
	 * Attempts to further mutate the branch will error.
	 * Any transactions in progress will be aborted.
	 * Calling dispose more than once has no effect.
	 */
	public dispose(): void {
		if (this.disposed) {
			return;
		}

		this.unsubscribeBranchTrimmer?.();

		this.disposed = true;
		this.#events.emit("dispose");
	}

	private assertNotDisposed(): void {
		assert(!this.disposed, 0x66e /* Branch is disposed */);
	}
}

/**
 * Registers an event listener that fires when the given branch forks.
 * The listener will also fire when any of those forks fork, and when those forks of forks fork, and so on.
 * @param branch - the branch that will be listened to for forks
 * @param onFork - the fork event listener
 * @returns a function which when called will deregister all registrations (including transitive) created by this function.
 * The deregister function has undefined behavior if called more than once.
 */
// Branches are invariant over TChange
export function onForkTransitive<T extends { events: Listenable<{ fork(t: T): void }> }>(
	branch: T,
	onFork: (fork: T) => void,
): () => void {
	const offs: (() => void)[] = [];
	offs.push(
		branch.events.on("fork", (fork: T) => {
			offs.push(onForkTransitive(fork, onFork));
			onFork(fork);
		}),
	);
	return () => offs.forEach((off) => off());
}

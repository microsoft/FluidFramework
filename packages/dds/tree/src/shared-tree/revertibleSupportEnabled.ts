/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	CommitKind,
	type GraphCommit,
	type LabelTree,
	type RevertOptionsAlpha,
	type RevertToOptionsAlpha,
	type RevertibleAlpha,
	RevertibleStatus,
	type RevisionTag,
	diffHistories,
	findAncestor,
	getDeltaChangeProfile,
	isAncestor,
	makeAnonChange,
	rebaseChange,
	tagChange,
} from "../core/index.js";
import { intoDelta } from "../feature-libraries/index.js";
import type { JsonCompatibleReadOnlyObject } from "../util/index.js";

import {
	toRevertibleSupport,
	type RevertMetrics,
	type RevertibleBranch,
	type RevertibleFactoryContext,
	type RevertibleSupportController,
	type RevertibleSupportHost,
} from "./revertibleSupport.js";
import { hasSchemaChange } from "./sharedTreeChangeFamily.js";
import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";

class DefaultRevertibleSupport implements RevertibleSupportController {
	private readonly revertibles = new Map<RevisionTag, RevertibleAlpha>();
	private readonly revertibleCommitBranches = new Map<RevisionTag, RevertibleBranch>();

	public constructor(private readonly host: RevertibleSupportHost) {}

	public createFactory(
		commit: GraphCommit<SharedTreeChange>,
		kind: CommitKind,
		labelTree: LabelTree | undefined,
	): RevertibleFactoryContext {
		const capturedLabelTree = labelTree === undefined ? undefined : cloneLabelTree(labelTree);
		let withinEventContext = true;
		return {
			factory: (onRevertibleDisposed) => {
				if (!withinEventContext) {
					throw new UsageError(
						"Cannot get a revertible outside of the context of a changed event.",
					);
				}
				const { revision } = commit;
				if (this.revertibleCommitBranches.has(revision)) {
					throw new UsageError(
						"Cannot generate the same revertible more than once. Note that this can happen when multiple changed event listeners are registered.",
					);
				}
				const revertible = this.makeRevertible(
					revision,
					kind,
					onRevertibleDisposed,
					capturedLabelTree,
				);
				this.revertibleCommitBranches.set(revision, this.host.getBranch().fork(commit));
				this.revertibles.set(revision, revertible);
				return revertible;
			},
			endEventContext: () => {
				withinEventContext = false;
			},
		};
	}

	public disposeRevertibleForRemovedCommit(revision: RevisionTag): void {
		this.revertibles.get(revision)?.dispose();
	}

	public checkCanRewind(): void {}

	public cloneRevertible(
		revision: RevisionTag,
		kind: CommitKind,
		onRevertibleDisposed: ((revertible: RevertibleAlpha) => void) | undefined,
		labelTree: LabelTree | undefined,
		sourceBranch: RevertibleBranch,
	): RevertibleAlpha {
		this.revertibleCommitBranches.set(revision, sourceBranch.fork());
		const cloned = this.makeRevertible(revision, kind, onRevertibleDisposed, labelTree);
		this.revertibles.set(revision, cloned);
		return cloned;
	}

	public dispose(): void {
		for (const revertible of this.revertibles.values()) {
			revertible.dispose();
		}
	}

	public getRevertTo(
		revisionString: string,
	): ((options?: RevertToOptionsAlpha) => void) | undefined {
		if (!this.host.canRevert()) {
			return undefined;
		}
		const revision = this.host.tryRecompressRevision(revisionString);
		if (revision === undefined) {
			return undefined;
		}
		const branch = this.host.getBranch();
		const head = branch.getHead();
		const pathResult = this.tryGetRevertPath(revision, branch);
		if (pathResult.type !== "success") {
			return undefined;
		}
		const path = pathResult.commitsToUndo;
		let wasUsed = false;
		return (options) => {
			if (wasUsed) {
				throw new UsageError(
					"The same `revertTo` method cannot be called more than once. Access it on the commit metadata before each call.",
				);
			}
			wasUsed = true;
			const customMetadata = this.host.snapshotCustomMetadata(options);
			if (
				!this.host.canRevert() ||
				this.host.getBranch() !== branch ||
				branch.getHead() !== head ||
				path.some((commit) => commit.wasTrimmed)
			) {
				throw new UsageError(
					"The target branch has changed since `revertTo` was requested. Avoid retaining references directly to the `revertTo` property.",
				);
			}
			this.applyRevertPath(path, customMetadata);
		};
	}

	public revertTo(revisionString: string, options: RevertToOptionsAlpha | undefined): void {
		const customMetadata = this.host.snapshotCustomMetadata(options);
		this.host.checkNotDisposed(
			"The branch has already been disposed and prior revisions cannot be reverted to.",
		);
		this.host.checkCanRevert(
			"Reverting to a revision",
			"Reverting to a revision is not supported during transactions.",
		);
		const revision = this.host.tryRecompressRevision(revisionString);
		if (revision === undefined) {
			throw new UsageError(`Unrecognized revision id: ${revisionString}`);
		}

		const pathResult = this.tryGetRevertPath(revision, this.host.getBranch());
		if (pathResult.type === "schemaChange") {
			throw new UsageError(
				`Cannot revert to revision ${revisionString} because the schema changed at intermediate commit ${pathResult.revision}.`,
			);
		} else if (pathResult.type === "targetNotFound") {
			throw new UsageError(`No commit found with revision: ${revisionString}`);
		}
		this.applyRevertPath(pathResult.commitsToUndo, customMetadata);
	}

	private tryGetRevertPath(
		revision: RevisionTag,
		branch: RevertibleBranch,
	):
		| { readonly type: "success"; readonly commitsToUndo: GraphCommit<SharedTreeChange>[] }
		| { readonly type: "schemaChange"; readonly revision: string }
		| { readonly type: "targetNotFound" } {
		const commitsToUndo: GraphCommit<SharedTreeChange>[] = [];
		let schemaChangeRevision: string | undefined;
		if (
			findAncestor([branch.getHead(), commitsToUndo], (commit) => {
				if (commit.revision === revision) {
					return true;
				}
				if (hasSchemaChange(commit.change)) {
					assert(commit.revision !== "root", "Unexpected schema change in root commit.");
					schemaChangeRevision = this.host.decompressRevision(commit.revision);
					return true;
				}
				return false;
			}) === undefined
		) {
			return { type: "targetNotFound" };
		}
		return schemaChangeRevision === undefined
			? { type: "success", commitsToUndo }
			: { type: "schemaChange", revision: schemaChangeRevision };
	}

	private applyRevertPath(
		commitsToUndo: GraphCommit<SharedTreeChange>[],
		customMetadata: JsonCompatibleReadOnlyObject | undefined,
	): void {
		if (commitsToUndo.length === 0) {
			return;
		}
		const revisionForInvert = this.host.mintRevisionTag();
		const toUndo = this.host.changeFamily.rebaser.compose(commitsToUndo);
		const inverse = this.host.changeFamily.rebaser.invert(
			makeAnonChange(toUndo),
			false,
			revisionForInvert,
		);
		this.host.applyRevert(
			tagChange(inverse, revisionForInvert),
			CommitKind.Default,
			undefined,
			customMetadata,
		);
	}

	private makeRevertible(
		revision: RevisionTag,
		kind: CommitKind,
		onRevertibleDisposed: ((revertible: RevertibleAlpha) => void) | undefined,
		labelTree: LabelTree | undefined,
	): RevertibleAlpha {
		const getStatus = (): RevertibleStatus =>
			this.revertibleCommitBranches.has(revision)
				? RevertibleStatus.Valid
				: RevertibleStatus.Disposed;
		const revertible: RevertibleAlpha = {
			get status(): RevertibleStatus {
				return getStatus();
			},
			revert: (releaseOrOptions: boolean | RevertOptionsAlpha = true) => {
				if (revertible.status === RevertibleStatus.Disposed) {
					throw new UsageError("Unable to revert a revertible that has been disposed.");
				}

				const options =
					typeof releaseOrOptions === "boolean"
						? { dispose: releaseOrOptions }
						: releaseOrOptions;
				const metrics = this.revert(
					revision,
					kind,
					labelTree,
					this.host.snapshotCustomMetadata(options),
				);
				this.host.logRevert(metrics);

				if (options.dispose ?? true) {
					revertible.dispose();
				}
			},
			clone: (targetView) => {
				const revertibleBranch = this.revertibleCommitBranches.get(revision);
				if (revertibleBranch === undefined) {
					throw new UsageError("Unable to clone a revertible that has been disposed.");
				}

				const target = this.host.resolveTarget(targetView);
				const commitToRevert = revertibleBranch.getHead();
				if (!isAncestor(commitToRevert, target.branchHead, true)) {
					throw new UsageError(
						"Cannot clone revertible for a commit that is not present on the given branch.",
					);
				}

				return target.controller.cloneRevertible(
					revision,
					kind,
					onRevertibleDisposed,
					labelTree,
					revertibleBranch,
				);
			},
			dispose: () => {
				if (revertible.status === RevertibleStatus.Disposed) {
					throw new UsageError(
						"Unable to dispose a revertible that has already been disposed.",
					);
				}
				this.disposeRevision(revision);
				onRevertibleDisposed?.(revertible);
			},
		};

		return revertible;
	}

	private disposeRevision(revision: RevisionTag): void {
		this.revertibleCommitBranches.get(revision)?.dispose();
		this.revertibleCommitBranches.delete(revision);
		this.revertibles.delete(revision);
	}

	private revert(
		revision: RevisionTag,
		kind: CommitKind,
		labelTree: LabelTree | undefined,
		customMetadata: JsonCompatibleReadOnlyObject | undefined,
	): RevertMetrics {
		this.host.checkCanRevert(
			"Reverting a commit",
			"Undo is not yet supported during transactions.",
		);

		const revertibleBranch = this.revertibleCommitBranches.get(revision);
		assert(revertibleBranch !== undefined, "Expected to find a revertible commit.");
		const commitToRevert = revertibleBranch.getHead();
		const revisionForInvert = this.host.mintRevisionTag();

		let change = tagChange(
			this.host.changeFamily.rebaser.invert(commitToRevert, false, revisionForInvert),
			revisionForInvert,
		);

		const headCommit = this.host.getBranch().getHead();
		if (commitToRevert !== headCommit) {
			const diff = diffHistories(
				this.host.changeFamily.rebaser,
				commitToRevert,
				headCommit,
				this.host.mintRevisionTag,
			);
			const ignoreNoChangeViolation = !sharedTreeChangeHasApplicationFacingChanges(diff);

			change = tagChange(
				rebaseChange(
					this.host.changeFamily.rebaser,
					change,
					commitToRevert,
					headCommit,
					this.host.mintRevisionTag,
					ignoreNoChangeViolation,
				).change,
				revisionForInvert,
			);
		}

		this.host.applyRevert(
			change,
			kind === CommitKind.Default || kind === CommitKind.Redo
				? CommitKind.Undo
				: CommitKind.Redo,
			labelTree,
			customMetadata,
		);

		let revertAge = 0;
		let currentCommit = headCommit;
		while (commitToRevert.revision !== currentCommit.revision) {
			revertAge++;
			const parentCommit = currentCommit.parent;
			assert(parentCommit !== undefined, "Expected to find a parent commit.");
			currentCommit = parentCommit;
		}

		return { age: revertAge };
	}
}

function cloneLabelTree(tree: LabelTree): LabelTree {
	return {
		label: tree.label,
		sublabels: tree.sublabels.map(cloneLabelTree),
	};
}

function sharedTreeChangeHasApplicationFacingChanges(change: SharedTreeChange): boolean {
	for (const inner of change.changes) {
		if (inner.type === "schema") {
			return true;
		}
		const delta = intoDelta(tagChange(inner.innerChange, undefined));
		const profile = getDeltaChangeProfile(delta);
		if (profile.hasChangesInDocumentTree || profile.hasChangesInDetachedTrees) {
			return true;
		}
	}
	return false;
}

/**
 * Enables creation and application of revertibles.
 *
 * @alpha
 */
export const RevertibleSupportEnabled = toRevertibleSupport(
	(getHost) => new DefaultRevertibleSupport(getHost()),
);

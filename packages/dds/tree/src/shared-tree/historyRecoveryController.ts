/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	type ChangeFamily,
	CommitKind,
	type GraphCommit,
	type LabelTree,
	type RevertibleAlpha,
	type RevertOptionsAlpha,
	RevertibleStatus,
	type RevisionTag,
	type TaggedChange,
	diffHistories,
	getDeltaChangeProfile,
	isAncestor,
	rebaseChange,
	tagChange,
} from "../core/index.js";
import { intoDelta } from "../feature-libraries/index.js";
import type { SharedTreeBranch } from "../shared-tree-core/index.js";
import type { UntypedTreeView } from "../simple-tree/index.js";
import type { JsonCompatibleReadOnlyObject } from "../util/index.js";

import type { SharedTreeChangeProcessingContext } from "./sharedTreeChangeFamily.js";
import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";

type TreeBranch = SharedTreeBranch<
	SharedTreeEditBuilder,
	SharedTreeChange,
	SharedTreeChangeProcessingContext
>;

/**
 * Metrics derived from a revert operation.
 */
export interface RevertMetrics {
	/**
	 * The age of the revertible commit relative to the head of the branch to which the reversion will be applied.
	 */
	readonly age: number;
}

interface HistoryRecoveryHost {
	readonly changeFamily: ChangeFamily<
		SharedTreeEditBuilder,
		SharedTreeChange,
		SharedTreeChangeProcessingContext
	>;
	readonly mintRevisionTag: () => RevisionTag;
	readonly getBranch: () => TreeBranch;
	readonly checkCanRevert: () => void;
	readonly applyRevert: (
		change: TaggedChange<SharedTreeChange>,
		kind: CommitKind,
		labelTree: LabelTree | undefined,
		customMetadata: JsonCompatibleReadOnlyObject | undefined,
	) => void;
	readonly resolveTarget: (targetView: UntypedTreeView) => {
		readonly controller: HistoryRecoveryController;
		readonly branchHead: GraphCommit<SharedTreeChange>;
	};
	readonly logRevert: (metrics: RevertMetrics) => void;
}

/**
 * Owns the history retained for revertibles and the algorithms used to recover earlier changes.
 */
export class HistoryRecoveryController {
	private readonly revertibles = new Map<RevisionTag, RevertibleAlpha>();
	private readonly revertibleCommitBranches = new Map<RevisionTag, TreeBranch>();

	public constructor(private readonly host: HistoryRecoveryHost) {}

	public createRevertible(
		commit: GraphCommit<SharedTreeChange>,
		kind: CommitKind,
		onRevertibleDisposed: ((revertible: RevertibleAlpha) => void) | undefined,
		labelTree: LabelTree | undefined,
	): RevertibleAlpha {
		const { revision } = commit;
		if (this.revertibleCommitBranches.has(revision)) {
			throw new UsageError(
				"Cannot generate the same revertible more than once. Note that this can happen when multiple changed event listeners are registered.",
			);
		}

		const revertible = this.makeRevertible(revision, kind, onRevertibleDisposed, labelTree);
		this.revertibleCommitBranches.set(revision, this.host.getBranch().fork(commit));
		this.revertibles.set(revision, revertible);
		return revertible;
	}

	public disposeRevertibleForRemovedCommit(revision: RevisionTag): void {
		this.revertibles.get(revision)?.dispose();
	}

	public dispose(): void {
		for (const revertible of this.revertibles.values()) {
			revertible.dispose();
		}
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
					snapshotCustomMetadata(options.customMetadata),
				);
				this.host.logRevert(metrics);

				if (options.dispose ?? true) {
					revertible.dispose();
				}
			},
			clone: (targetView: UntypedTreeView) => {
				// TODO:#23442: Reuse one retained branch per revision when cloning revertibles to forked branches.
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

				target.controller.revertibleCommitBranches.set(revision, revertibleBranch.fork());
				return target.controller.makeRevertible(
					revision,
					kind,
					onRevertibleDisposed,
					labelTree,
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
		this.host.checkCanRevert();

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

function snapshotCustomMetadata(
	customMetadata: JsonCompatibleReadOnlyObject | undefined,
): JsonCompatibleReadOnlyObject | undefined {
	if (customMetadata === undefined) {
		return undefined;
	}
	let serialized: string | undefined;
	try {
		serialized = JSON.stringify(customMetadata);
	} catch (error: unknown) {
		throw new UsageError(
			`"customMetadata" must be JSON-serializable: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	if (serialized === undefined) {
		throw new UsageError(`"customMetadata" must be JSON-serializable.`);
	}
	const snapshot: unknown = JSON.parse(serialized);
	if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
		throw new UsageError(`"customMetadata" must be a JSON object.`);
	}
	return snapshot as JsonCompatibleReadOnlyObject;
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

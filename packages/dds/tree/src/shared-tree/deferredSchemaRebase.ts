/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	CommitKind,
	CommitOutcome,
	findAncestor,
	type GraphCommit,
	type RevisionTag,
	type RevisionReplacer,
	type TreeStoredSchema,
	tagChange,
	rebaseBranch,
} from "../core/index.js";
import { assert } from "@fluidframework/core-utils/internal";
import {
	allowsRepoSuperset,
	defaultSchemaPolicy,
	DefaultRevisionReplacer,
} from "../feature-libraries/index.js";
import { SharedTreeBranch, type BranchReconciliation } from "../shared-tree-core/index.js";

import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { TreeCheckout } from "./treeCheckout.js";
import { getCommitOutcome } from "./sharedTreeChangeFamily.js";

/**
 * Retained input for reconciling a view branch before full schema/data rebase support.
 * @remarks
 * The owner must pin these histories and their repair data for the duration of the operation.
 * Read-only references alone do not protect a commit from history trimming.
 */
export interface DeferredSchemaRebaseInput {
	readonly originalBase: GraphCommit<SharedTreeChange>;
	readonly currentBase: GraphCommit<SharedTreeChange>;
	readonly localHead: GraphCommit<SharedTreeChange>;
	readonly targetSchema: TreeStoredSchema;
	readonly authoringSchema: TreeStoredSchema;
	readonly schemaRevision: RevisionTag;
	readonly rejectedRevisions: ReadonlySet<RevisionTag>;
	readonly changeFamily: TreeCheckout["mainBranch"]["changeFamily"];
	readonly mintRevision: () => RevisionTag;
}

/**
 * A prepared reconciliation or an explicit refusal to risk the retained work.
 * @remarks
 * A successful result is not a submitted or accepted operation.
 * The controller supplies revision allocation and owns publication, retry accounting, and notification.
 */
export type DeferredSchemaRebaseResult =
	| {
			readonly type: "prepared";
			readonly reconciliation: BranchReconciliation<SharedTreeChange>;
			readonly commits: readonly {
				readonly originalRevision: RevisionTag;
				readonly commit: GraphCommit<SharedTreeChange>;
			}[];
	  }
	| {
			readonly type: "unsafe";
			readonly reason: "schemaConflict" | "constraintViolation" | "unrelatedHistory";
	  };

/**
 * Temporary boundary for the current schema/data rebase limitations.
 * @remarks
 * Implementations may operate on separately owned scratch branches, but must not mutate live input
 * checkouts, submit ops, emit application events, or alter the logical publication's retry allowance.
 * Replace the implementation with standard rebase when all required cases are supported.
 */
export type DeferredSchemaRebase = (
	input: DeferredSchemaRebaseInput,
) => DeferredSchemaRebaseResult;

/**
 * Reconstructs rejected data through data-only histories under a compatible schema expansion.
 * @remarks
 * This temporary path only drops the known internal schema prefix and monotonic remote schema
 * expansions. All application data and constraints pass through the normal data rebaser.
 * It never treats the empty changes produced by the current schema rebaser as the original work.
 *
 * The prepared net change uses the original content identifiers, so it can update the existing
 * forest without replacing application objects. The checkout then maps detached-content identifiers
 * and native revertibles to the retry history. Do not use the ordinary mixed-history net change:
 * it removes the old content and rebuilds it under the new revisions.
 */
export const rebaseDeferredChanges: DeferredSchemaRebase = (input) => {
	const {
		originalBase,
		currentBase,
		localHead,
		targetSchema,
		authoringSchema,
		schemaRevision,
		rejectedRevisions,
		changeFamily,
		mintRevision,
	} = input;
	if (!allowsRepoSuperset(defaultSchemaPolicy, authoringSchema, targetSchema)) {
		return { type: "unsafe", reason: "schemaConflict" };
	}
	const local: GraphCommit<SharedTreeChange>[] = [];
	const remote: GraphCommit<SharedTreeChange>[] = [];
	if (
		findAncestor([localHead, local], (commit) => commit === originalBase) === undefined ||
		findAncestor([currentBase, remote], (commit) => commit === originalBase) === undefined
	) {
		return { type: "unsafe", reason: "unrelatedHistory" };
	}
	const source = new SharedTreeBranch(originalBase, changeFamily, mintRevision);
	const target = new SharedTreeBranch(originalBase, changeFamily, mintRevision);
	try {
		for (const commit of local) {
			if (commit.revision === schemaRevision) {
				continue;
			}
			if (commit.change.changes.some((change) => change.type === "schema")) {
				return { type: "unsafe", reason: "schemaConflict" };
			}
			source.apply(commit, CommitKind.Default, commit.customMetadata);
		}
		for (const commit of remote) {
			if (rejectedRevisions.has(commit.revision) || commit.revision === schemaRevision) {
				continue;
			}
			for (const change of commit.change.changes) {
				if (
					change.type === "schema" &&
					!allowsRepoSuperset(
						defaultSchemaPolicy,
						change.innerChange.schema.old,
						change.innerChange.schema.new,
					)
				) {
					return { type: "unsafe", reason: "schemaConflict" };
				}
			}
			const data: SharedTreeChange = {
				changes: commit.change.changes.filter((change) => change.type === "data"),
			};
			if (data.changes.length > 0) {
				target.apply(
					tagChange(data, commit.revision),
					CommitKind.Default,
					commit.customMetadata,
				);
			}
		}
		const rebased = rebaseBranch(
			mintRevision,
			changeFamily.rebaser,
			source.getHead(),
			target.getHead(),
		);
		if (
			rebased.commits.sourceCommits.some(
				(commit) => getCommitOutcome(commit.change) !== CommitOutcome.FullyApplied,
			)
		) {
			return { type: "unsafe", reason: "constraintViolation" };
		}
		const mappings: RevisionReplacer[] = [];
		const commits: {
			originalRevision: RevisionTag;
			commit: GraphCommit<SharedTreeChange>;
		}[] = [];
		for (const commit of rebased.commits.sourceCommits) {
			let change = commit.change;
			// Later retained edits can refer to content built by earlier retry members.
			for (const priorMapping of mappings) {
				change = changeFamily.rebaser.changeRevision(change, {
					updatedRevision: commit.revision,
					isObsolete: (priorRevision) => priorMapping.isObsolete(priorRevision),
					getUpdatedAtomId: (id, count) => priorMapping.getUpdatedAtomId(id, count),
				});
			}
			const revision = mintRevision();
			const mapping = new DefaultRevisionReplacer(revision, new Set([commit.revision]));
			change = changeFamily.rebaser.changeRevision(change, mapping);
			mappings.push(mapping);
			commits.push({
				originalRevision: commit.revision,
				commit: { revision, change, customMetadata: commit.customMetadata },
			});
		}
		return {
			type: "prepared",
			commits,
			reconciliation: {
				change: {
					changes: [
						{
							type: "schema",
							innerChange: {
								schema: { old: authoringSchema, new: targetSchema },
								isInverse: false,
							},
						},
						...(rebased.sourceChange?.changes ?? []),
					],
				},
				revisionReplacers: mappings,
			},
		};
	} finally {
		source.dispose();
		target.dispose();
	}
};

/**
 * Refreshes known schema-only private history under the current rebase limitation.
 * @remarks
 * Unlike reconstruction of application work, this executor deliberately mutates the private checkout.
 * The owner must suppress intermediate schema notifications and must provide the last schema-only head.
 * No user edits may have been added after that head.
 * Remove this workaround when standard schema/data rebase preserves the private upgrade.
 */
export function refreshSchemaOnlyView(
	checkout: TreeCheckout,
	base: TreeCheckout,
	schemaOnlyHead: GraphCommit<SharedTreeChange>,
	target: TreeStoredSchema | undefined,
): void {
	assert(
		checkout.mainBranch.getHead() === schemaOnlyHead,
		"Schema-only refresh must not discard application changes.",
	);
	checkout.synchronizeFrom(base);
	checkout.mainBranch.removeAfter(base.mainBranch.getHead());
	if (target !== undefined) {
		checkout.updateSchema(target);
	}
}

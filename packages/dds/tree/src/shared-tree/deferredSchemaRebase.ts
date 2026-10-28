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
	type ChangeAtomId,
	type TreeStoredSchema,
	rebaseBranch,
	findCommonAncestor,
} from "../core/index.js";
import { assert } from "@fluidframework/core-utils/internal";
import { allowsRepoSuperset, defaultSchemaPolicy } from "../feature-libraries/index.js";
import { SharedTreeBranch, type BranchReconciliation } from "../shared-tree-core/index.js";

import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { CheckoutBase } from "./treeCheckout.js";
import { getCommitOutcome, isSchemaOnlyChange } from "./sharedTreeChangeFamily.js";

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
	readonly schemaRevisions: ReadonlySet<RevisionTag>;
	readonly rejectedRevisions: ReadonlySet<RevisionTag>;
	readonly changeFamily: CheckoutBase["mainBranch"]["changeFamily"];
	readonly mintRevision: () => RevisionTag;
	/** Application-fork reconciliation preserves unpublished commit revisions. */
	readonly preserveRevisions?: true;
	/** Maps accepted retry identifiers back into the original source's identifier space. */
	readonly targetRevisionReplacers?: readonly RevisionReplacer[];
}

/**
 * Maps one revision to another without changing its local identifiers.
 * Separate retry commits never combine allocation scopes, so this mapping is reversible.
 */
function replaceRevision(from: RevisionTag, to: RevisionTag): RevisionReplacer {
	return {
		updatedRevision: to,
		isObsolete: (revision) => revision === from,
		getUpdatedAtomId: <T extends ChangeAtomId>(id: T): T =>
			id.revision === from ? { ...id, revision: to } : id,
	};
}

function replaceCommitRevisions(
	commit: GraphCommit<SharedTreeChange>,
	replacers: readonly RevisionReplacer[],
	changeFamily: DeferredSchemaRebaseInput["changeFamily"],
): GraphCommit<SharedTreeChange> {
	let current = commit;
	for (const replacer of replacers) {
		const revision = replacer.isObsolete(current.revision)
			? replacer.updatedRevision
			: current.revision;
		current = {
			...current,
			revision,
			change: changeFamily.rebaser.changeRevision(current.change, {
				updatedRevision: revision,
				isObsolete: (priorRevision) => replacer.isObsolete(priorRevision),
				getUpdatedAtomId: (id, count) => replacer.getUpdatedAtomId(id, count),
			}),
		};
	}
	return current;
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
		schemaRevisions,
		rejectedRevisions,
		changeFamily,
		mintRevision,
		targetRevisionReplacers = [],
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
	const source = new SharedTreeBranch(originalBase, changeFamily, mintRevision, {
		trimmedCommitCount: 0,
	});
	const target = new SharedTreeBranch(originalBase, changeFamily, mintRevision, {
		trimmedCommitCount: 0,
	});
	try {
		for (const commit of local) {
			if (schemaRevisions.has(commit.revision)) {
				continue;
			}
			if (commit.change.changes.some((change) => change.type === "schema")) {
				return { type: "unsafe", reason: "schemaConflict" };
			}
			source.apply(commit, CommitKind.Default, commit.customMetadata);
		}
		for (const commit of remote) {
			if (rejectedRevisions.has(commit.revision) || schemaRevisions.has(commit.revision)) {
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
					replaceCommitRevisions(
						{ ...commit, change: data },
						targetRevisionReplacers,
						changeFamily,
					),
					CommitKind.Default,
					commit.customMetadata,
				);
			}
		}
		const rebased = rebaseBranch(
			mintRevision,
			changeFamily,
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
			if (input.preserveRevisions === true) {
				commits.push({ originalRevision: commit.revision, commit });
				continue;
			}
			// Later retained edits can refer to content built by earlier retry members.
			let change = replaceCommitRevisions(commit, mappings, changeFamily).change;
			const revision = mintRevision();
			const mapping = replaceRevision(commit.revision, revision);
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
			// A merge applies only the prepared commits to its target. Computing the source
			// net change is unnecessary there and has stricter composition requirements.
			get reconciliation(): BranchReconciliation<SharedTreeChange> {
				return {
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
				};
			},
		};
	} finally {
		source.dispose();
		target.dispose();
	}
};

/**
 * Reconciles application forks across known, private schema preparation.
 * @remarks
 * The weak keys identify schema-only preparation without retaining unused history.
 * This is temporary: ordinary schema/data rebase should replace these projections.
 */
export class DeferredSchemaForkRebaser {
	private readonly schemaPreparation = new WeakSet<GraphCommit<SharedTreeChange>>();
	private readonly replacements = new Map<
		RevisionTag,
		{
			readonly forward: RevisionReplacer;
			readonly reverse: RevisionReplacer;
		}
	>();
	private readonly observedBranches = new WeakSet<CheckoutBase["mainBranch"]>();

	/**
	 * Releases mappings once the corresponding original revisions are trimmed.
	 * Any fork that can still contain original work pins an earlier common ancestor.
	 */
	public observeBranch(branch: CheckoutBase["mainBranch"]): void {
		if (this.observedBranches.has(branch)) {
			return;
		}
		this.observedBranches.add(branch);
		const offTrim = branch.events.on("ancestryTrimmed", (revisions) => {
			for (const revision of revisions) {
				this.replacements.delete(revision);
			}
		});
		const offDispose = branch.events.on("dispose", () => {
			offTrim();
			offDispose();
		});
	}

	/**
	 * Keeps retry mappings available to forks that still retain the original commits.
	 * Revisions, rather than commit object identities, survive ordinary data rebases.
	 */
	public rememberRevisions(
		originalHead: GraphCommit<SharedTreeChange>,
		replacers: readonly RevisionReplacer[],
	): void {
		for (const replacer of replacers) {
			const original = findAncestor(originalHead, (commit) =>
				replacer.isObsolete(commit.revision),
			);
			assert(original !== undefined, "A retry mapping must identify retained original work.");
			this.replacements.set(original.revision, {
				forward: replacer,
				reverse: replaceRevision(replacer.updatedRevision, original.revision),
			});
		}
	}

	public rememberSchema(commit: GraphCommit<SharedTreeChange>): void {
		assert(
			commit.change.changes.length === 1 && commit.change.changes[0]?.type === "schema",
			"Only schema-only preparation may be omitted from application-fork reconciliation.",
		);
		this.schemaPreparation.add(commit);
	}

	private prepare(
		source: CheckoutBase,
		target: CheckoutBase,
	): Extract<DeferredSchemaRebaseResult, { type: "prepared" }> | undefined {
		const sourceCommits: GraphCommit<SharedTreeChange>[] = [];
		const targetCommits: GraphCommit<SharedTreeChange>[] = [];
		const ancestor = findCommonAncestor(
			[source.mainBranch.getHead(), sourceCommits],
			[target.mainBranch.getHead(), targetCommits],
		);
		const schema = sourceCommits.find((commit) => this.schemaPreparation.has(commit));
		if (ancestor === undefined || schema === undefined || targetCommits.length === 0) {
			// No crossed private prefix, or a schema operation outside this proven projection.
			return undefined;
		}
		if (!allowsRepoSuperset(defaultSchemaPolicy, source.storedSchema, target.storedSchema)) {
			throw new Error("Deferred schema fork reconciliation is unsafe: schemaConflict.");
		}
		const forwardReplacers: RevisionReplacer[] = [];
		const reverseReplacers: RevisionReplacer[] = [];
		for (const commit of sourceCommits) {
			const replacement = this.replacements.get(commit.revision);
			if (replacement !== undefined) {
				const targetCommit = findAncestor(
					target.mainBranch.getHead(),
					(candidate) => candidate.revision === replacement.forward.updatedRevision,
				);
				if (targetCommit !== undefined) {
					assert(
						getCommitOutcome(targetCommit.change) === CommitOutcome.FullyApplied,
						"An application fork cannot depend on rejected recovery work.",
					);
					forwardReplacers.push(replacement.forward);
					reverseReplacers.unshift(replacement.reverse);
				}
			}
		}
		const prepared = rebaseDeferredChanges({
			originalBase: ancestor,
			currentBase: target.mainBranch.getHead(),
			localHead: source.mainBranch.getHead(),
			authoringSchema: source.storedSchema.clone(),
			targetSchema: target.storedSchema.clone(),
			schemaRevisions: new Set([schema.revision]),
			rejectedRevisions: new Set(),
			changeFamily: target.mainBranch.changeFamily,
			mintRevision: () => target.mintRevision(),
			preserveRevisions: true,
			// Rebase in the original identifier space. Retagging an already-rebased source
			// before this step can invalidate the sequence field's tombstone ordering.
			targetRevisionReplacers: reverseReplacers,
		});
		if (prepared.type === "unsafe") {
			throw new Error(`Deferred schema fork reconciliation is unsafe: ${prepared.reason}.`);
		}
		return {
			type: "prepared",
			commits: prepared.commits.map(({ originalRevision, commit }) => ({
				originalRevision,
				commit: replaceCommitRevisions(
					commit,
					forwardReplacers,
					target.mainBranch.changeFamily,
				),
			})),
			get reconciliation(): BranchReconciliation<SharedTreeChange> {
				return {
					...prepared.reconciliation,
					omittedRevisions: new Set([schema.revision]),
					// A surviving revision can have a different schema context after the rebase.
					// Keep its identifiers but move native undo to that surviving commit context.
					revisionReplacers: [
						...forwardReplacers,
						...sourceCommits
							.filter((commit) =>
								commit.change.changes.some((change) => change.type === "data"),
							)
							.map<RevisionReplacer>((commit) => ({
								updatedRevision: commit.revision,
								isObsolete: (revision) => revision === commit.revision,
								getUpdatedAtomId: (id) => id,
							})),
					],
				};
			},
		};
	}

	public merge(source: CheckoutBase, target: CheckoutBase): boolean {
		const prepared = this.prepare(source, target);
		if (prepared === undefined) {
			return false;
		}
		const candidate = target.fork();
		try {
			for (const { commit } of prepared.commits) {
				candidate.mainBranch.apply(commit, CommitKind.Default, commit.customMetadata);
			}
			// The candidate extends the target directly, so this merge cannot cross a schema
			// prefix or renumber the application's commits. The source fork remains independent.
			target.mainBranch.merge(candidate.mainBranch);
		} finally {
			candidate.dispose();
		}
		return true;
	}

	public rebase(source: CheckoutBase, target: CheckoutBase): boolean {
		const prepared = this.prepare(source, target);
		if (prepared === undefined) {
			return false;
		}
		// The branch's rebase event can advance the trimming boundary before the checkout
		// applies its net change. Keep old repair data pinned until identifier mapping finishes.
		const retained = source.mainBranch.fork();
		const candidate = target.fork();
		try {
			for (const { commit } of prepared.commits) {
				candidate.mainBranch.apply(commit, CommitKind.Default, commit.customMetadata);
			}
			source.reconcileSchema(() => source.synchronizeFrom(candidate, prepared.reconciliation));
		} finally {
			candidate.dispose();
			retained.dispose();
		}
		return true;
	}
}

/**
 * Removes known schema-only private preparation before reconciliation or coalescing.
 * @remarks
 * Unlike reconstruction of application work, this executor deliberately mutates the private checkout.
 * The owner must suppress intermediate schema notifications and provide the complete preparation suffix.
 * The suffix must not contain application data or constraints.
 * Remove this workaround when standard schema/data rebase preserves the private upgrade.
 */
export function removeSchemaPreparation(
	checkout: CheckoutBase,
	base: GraphCommit<SharedTreeChange>,
	schemaOnlyHead: GraphCommit<SharedTreeChange>,
): void {
	assert(
		checkout.mainBranch.getHead() === schemaOnlyHead,
		"Schema-only refresh must not discard application changes.",
	);
	const suffix: GraphCommit<SharedTreeChange>[] = [];
	assert(
		findAncestor([schemaOnlyHead, suffix], (commit) => commit === base) !== undefined &&
			suffix.every((commit) => isSchemaOnlyChange(commit.change)),
		"Removing preparation must not discard application changes.",
	);
	checkout.mainBranch.removeAfter(base);
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType } from "@fluidframework/core-interfaces/internal";

import type {
	ChangeFamily,
	CommitKind,
	GraphCommit,
	LabelTree,
	RevertToOptionsAlpha,
	RevertibleAlpha,
	RevertibleAlphaFactory,
	RevisionTag,
	TaggedChange,
} from "../core/index.js";
import type { SharedTreeBranch } from "../shared-tree-core/index.js";
import type { UntypedTreeView } from "../simple-tree/index.js";
import type { JsonCompatibleReadOnlyObject } from "../util/index.js";

import type { SharedTreeChangeProcessingContext } from "./sharedTreeChangeFamily.js";
import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";

export type RevertibleBranch = SharedTreeBranch<
	SharedTreeEditBuilder,
	SharedTreeChange,
	SharedTreeChangeProcessingContext
>;

/**
 * Selects whether a checkout supports creating and applying revertibles.
 *
 * @remarks
 * Current options are {@link RevertibleSupportEnabled} and {@link RevertibleSupportDisabled}.
 * The implementations are in separate modules so a composition root that does not reference
 * {@link RevertibleSupportEnabled} can exclude enabled history-recovery code from its bundle.
 *
 * Passing {@link RevertibleSupportDisabled} to {@link configuredSharedTreeAlpha} disables runtime
 * history recovery, but does not exclude the enabled implementation from the bundle because that
 * factory references it as the default. Use {@link configuredSharedTreeWithFeaturesAlpha}, which
 * defaults omitted feature providers to disabled implementations, to control bundle inclusion.
 *
 * @sealed @alpha
 */
export interface RevertibleSupport extends ErasedType<"RevertibleSupport"> {}

/**
 * Metrics derived from a revert operation.
 */
export interface RevertMetrics {
	/**
	 * The age of the revertible commit relative to the head of the branch to which the reversion will be applied.
	 */
	readonly age: number;
}

export interface RevertibleSupportHost {
	readonly changeFamily: ChangeFamily<
		SharedTreeEditBuilder,
		SharedTreeChange,
		SharedTreeChangeProcessingContext
	>;
	readonly mintRevisionTag: () => RevisionTag;
	readonly tryRecompressRevision: (revision: string) => RevisionTag | undefined;
	readonly decompressRevision: (revision: RevisionTag) => string;
	readonly getBranch: () => RevertibleBranch;
	readonly canRevert: () => boolean;
	readonly checkNotDisposed: (usageError: string) => void;
	readonly checkCanRevert: (
		description: "Reverting a commit" | "Reverting to a revision",
		transactionError: string,
	) => void;
	readonly snapshotCustomMetadata: (
		options: { readonly customMetadata?: JsonCompatibleReadOnlyObject } | undefined,
	) => JsonCompatibleReadOnlyObject | undefined;
	readonly applyRevert: (
		change: TaggedChange<SharedTreeChange>,
		kind: CommitKind,
		labelTree: LabelTree | undefined,
		customMetadata: JsonCompatibleReadOnlyObject | undefined,
	) => void;
	readonly resolveTarget: (targetView: UntypedTreeView) => {
		readonly controller: RevertibleSupportController;
		readonly branchHead: GraphCommit<SharedTreeChange>;
	};
	readonly logRevert: (metrics: RevertMetrics) => void;
}

export interface RevertibleSupportController {
	createFactory(
		commit: GraphCommit<SharedTreeChange>,
		kind: CommitKind,
		labelTree: LabelTree | undefined,
	): RevertibleFactoryContext | undefined;
	cloneRevertible(
		revision: RevisionTag,
		kind: CommitKind,
		onRevertibleDisposed: ((revertible: RevertibleAlpha) => void) | undefined,
		labelTree: LabelTree | undefined,
		sourceBranch: RevertibleBranch,
	): RevertibleAlpha;
	disposeRevertibleForRemovedCommit(revision: RevisionTag): void;
	checkCanRewind(): void;
	getRevertTo(revision: string): ((options?: RevertToOptionsAlpha) => void) | undefined;
	revertTo(revision: string, options: RevertToOptionsAlpha | undefined): void;
	dispose(): void;
}

export interface RevertibleFactoryContext {
	readonly factory: RevertibleAlphaFactory;
	endEventContext(): void;
}

type RevertibleSupportFactory = (
	getHost: () => RevertibleSupportHost,
) => RevertibleSupportController;

/**
 * Creates a revertible-support provider from its factory.
 */
export function toRevertibleSupport(factory: RevertibleSupportFactory): RevertibleSupport {
	return factory as unknown as RevertibleSupport;
}

/**
 * Creates the configured controller.
 */
export function buildRevertibleSupport(
	support: RevertibleSupport,
	getHost: () => RevertibleSupportHost,
): RevertibleSupportController {
	return (support as unknown as RevertibleSupportFactory)(getHost);
}

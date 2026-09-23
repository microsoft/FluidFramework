/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IApplicationProjectionSummary,
	ISummaryGenerationContext,
} from "@fluidframework/container-runtime/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import type { ISummaryContext } from "@fluidframework/driver-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import { Tree } from "@fluidframework/tree";

import {
	canonicalParts,
	createProjectionManifest,
	createProjectionTree,
	projectionLayout,
} from "./appProjection.js";
import { serializeHtml } from "./htmlSerializer.js";
import { fromTree, type HtmlChildren, type HtmlView } from "./htmlTreeSchema.js";

/** A revision is meaningful only for one uninterrupted subscription to a particular subtree. */
interface IPartRevision {
	readonly root: HtmlChildren;
	readonly binding: object;
	readonly revision: number;
}

/** Revisions captured by one proposal and bound to the parent that accepted that projection. */
interface IAcceptedProjection {
	readonly context: ISummaryContext;
	readonly parts: ReadonlyMap<string, IPartRevision>;
}

/** Mutable local invalidation state plus the subscription that must be removed with the part. */
interface ITrackedPart {
	readonly root: HtmlChildren;
	/** Local-only subscription identity; undo may resurrect a root whose old listener was removed. */
	readonly binding: object;
	revision: number;
	readonly unsubscribe: () => void;
}

/** Equal sequence numbers alone do not establish that stored paths exist under the same parent. */
function sameParent(left: ISummaryContext, right: ISummaryContext | undefined): boolean {
	return (
		right !== undefined &&
		left.ackHandle === right.ackHandle &&
		left.proposalHandle === right.proposalHandle &&
		left.referenceSequenceNumber === right.referenceSequenceNumber
	);
}

/**
 * Project the collaborative model into the application's named summary subtrees.
 * Incremental summaries reuse unchanged parts before traversal or serialization.
 * Local change counters invalidate content; only proposal-specific acceptance establishes reusable paths.
 * Subtree and subscription identities prevent name reuse or undo from matching an old dirty counter.
 */
export class HtmlSummaryProjection {
	private readonly parts = new Map<string, ITrackedPart>();
	private unsubscribeRoot: () => void;
	private readonly unsubscribeView: () => void;
	private accepted: IAcceptedProjection | undefined;
	private readonly manifest: string | undefined;

	/**
	 * Observe model changes and retain opaque application metadata without writing to the document.
	 */
	public constructor(
		private readonly view: HtmlView,
		private readonly onSerialize?: (part: string) => void,
		metadata: { readonly manifest?: string } = { manifest: createProjectionManifest() },
	) {
		this.manifest = metadata.manifest;
		this.unsubscribeRoot = this.subscribeRoot();
		this.unsubscribeView = view.events.on("rootChanged", () => this.rebindRoot());
	}

	/** Rebind subscriptions when either the document root or its parts map is replaced. */
	private rebindRoot(): void {
		this.unsubscribeRoot();
		this.unsubscribeRoot = this.subscribeRoot();
	}

	/** Observe structural changes separately from descendant content edits. */
	private subscribeRoot(): () => void {
		this.refreshParts();
		const unsubscribeParts = Tree.on(this.view.root.parts, "nodeChanged", () =>
			this.refreshParts(),
		);
		const unsubscribeDocument = Tree.on(this.view.root, "nodeChanged", () =>
			this.rebindRoot(),
		);
		return () => {
			unsubscribeParts();
			unsubscribeDocument();
		};
	}

	/** Preserve subscriptions for unchanged identities and release removed or replaced subtrees. */
	private refreshParts(): void {
		for (const [name, tracked] of this.parts) {
			if (this.view.root.parts.get(name) !== tracked.root) {
				tracked.unsubscribe();
				this.parts.delete(name);
			}
		}
		for (const [name, root] of this.view.root.parts) {
			if (!this.parts.has(name)) {
				const tracked: ITrackedPart = {
					root,
					// Undo can restore this exact node object after unsubscription.
					// Never compare a restarted counter with its earlier subscription's captured value.
					binding: {},
					revision: 0,
					unsubscribe: Tree.on(root, "treeChanged", () => {
						tracked.revision++;
					}),
				};
				this.parts.set(name, tracked);
			}
		}
	}

	/**
	 * Capture one checkpoint, validating names before constructing any summary trees.
	 * Name sorting never traverses HTML; only changed identities or revisions need content traversal.
	 * Array/map iteration order is irrelevant.
	 * Acceptance retains generation-time state, not later edits made while the proposal uploads.
	 */
	public summarize(context: ISummaryGenerationContext): IApplicationProjectionSummary {
		const ordered = canonicalParts(
			Array.from(this.parts, ([name, tracked]) => ({ name, tracked })),
		);
		const captured = new Map<string, IPartRevision>();
		const canReuse =
			context.trackState &&
			!context.fullTree &&
			this.accepted !== undefined &&
			sameParent(this.accepted.context, context.previousSummary);
		const projection = createProjectionTree(this.manifest);
		const partTrees = new SummaryTreeBuilder();
		for (const { name, tracked } of ordered) {
			captured.set(name, {
				root: tracked.root,
				binding: tracked.binding,
				revision: tracked.revision,
			});
			const previous = this.accepted?.parts.get(name);
			if (
				canReuse &&
				previous?.root === tracked.root &&
				previous.binding === tracked.binding &&
				previous.revision === tracked.revision
			) {
				partTrees.addHandle(
					name,
					SummaryType.Tree,
					`/${projectionLayout.key}/${projectionLayout.parts}/${name}`,
				);
			} else {
				this.onSerialize?.(name);
				const part = new SummaryTreeBuilder();
				part.addBlob(projectionLayout.payload, serializeHtml(fromTree(tracked.root)));
				partTrees.addWithStats(name, part);
			}
		}
		projection.addWithStats(projectionLayout.parts, partTrees);
		return {
			summary: projection.summary,
			onAccepted: context.trackState
				? (accepted) => {
						this.accepted = { context: { ...accepted }, parts: captured };
					}
				: undefined,
		};
	}

	/** Remove all listeners before disposing the view; no persisted content is changed. */
	public dispose(): void {
		this.unsubscribeView();
		this.unsubscribeRoot();
		for (const { unsubscribe } of this.parts.values()) unsubscribe();
		this.parts.clear();
		this.accepted = undefined;
	}
}

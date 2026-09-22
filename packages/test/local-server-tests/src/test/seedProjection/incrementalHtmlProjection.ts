/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	AdditionalSummaryTree,
	SummaryGenerationContext,
} from "@fluidframework/container-runtime/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import type { ISummaryContext } from "@fluidframework/driver-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import { Tree } from "@fluidframework/tree";

import {
	createProjectionManifest,
	htmlPartIds,
	projectionGroup,
	projectionKey,
	type HtmlPartId,
} from "./externalSeedFile.js";
import { serializeHtml } from "./htmlSeedFormat.js";
import { fromTree, type HtmlChildren, type HtmlView } from "./htmlTreeSchema.js";

/** Revisions captured by one proposal, tied to the parent that actually accepted its projection. */
interface AcceptedProjection {
	/** Storage parent against which the captured part paths are known to exist. */
	readonly context: ISummaryContext;
	/** Local dirty counters as captured at generation, never the counters at ACK delivery time. */
	readonly revisions: Readonly<Record<HtmlPartId, number>>;
}

/** Compare the exact summary parent rather than assuming equal sequence numbers imply equal storage state. */
function sameParent(left: ISummaryContext, right: ISummaryContext | undefined): boolean {
	return (
		right !== undefined &&
		left.ackHandle === right.ackHandle &&
		left.proposalHandle === right.proposalHandle &&
		left.referenceSequenceNumber === right.referenceSequenceNumber
	);
}

/**
 * Project two SharedTree subtrees without rendering or uploading unchanged HTML.
 * Dirty events are local invalidation only; proposal-specific acceptance establishes reusable storage paths.
 * A new instance encodes once rather than comparing its local counters to another client's counter values.
 * Dispose subscriptions before disposing the view.
 */
export class IncrementalHtmlProjection {
	private readonly revisions: Record<HtmlPartId, number> = { first: 0, second: 0 };
	private readonly roots = new Map<HtmlPartId, HtmlChildren>();
	private readonly unsubscribeParts = new Map<HtmlPartId, () => void>();
	private unsubscribeRoot: () => void;
	private readonly unsubscribeView: () => void;
	private accepted: AcceptedProjection | undefined;

	public constructor(
		private readonly view: HtmlView,
		private readonly onSerialize?: (part: HtmlPartId) => void,
	) {
		this.unsubscribeRoot = this.subscribeRoot();
		this.unsubscribeView = view.events.on("rootChanged", () => {
			this.unsubscribeRoot();
			for (const part of htmlPartIds) this.revisions[part]++;
			this.unsubscribeRoot = this.subscribeRoot();
		});
	}

	/** Rebind part and shallow-parent listeners when the document root itself is replaced. */
	private subscribeRoot(): () => void {
		for (const part of htmlPartIds) {
			this.unsubscribeParts.get(part)?.();
			this.subscribePart(part);
		}
		return Tree.on(this.view.root, "nodeChanged", () => {
			for (const part of htmlPartIds) {
				if (this.roots.get(part) !== this.view.root[part]) {
					this.unsubscribeParts.get(part)?.();
					this.revisions[part]++;
					this.subscribePart(part);
				}
			}
		});
	}

	/** Subscribe to content changes for one part; replacing the part itself is observed on its parent. */
	private subscribePart(part: HtmlPartId): void {
		const root = this.view.root[part];
		this.roots.set(part, root);
		this.unsubscribeParts.set(
			part,
			Tree.on(root, "treeChanged", () => {
				this.revisions[part]++;
			}),
		);
	}

	/**
	 * Build one checkpoint's projection, returning handles before invoking serializers for unchanged parts.
	 * Capturing counters is constant work per part, not a traversal or byte-comparison of unchanged HTML.
	 * The runtime calls onAccepted only for this proposal after adopting its actual native/GC/storage parent.
	 */
	public summarize(context: SummaryGenerationContext): AdditionalSummaryTree {
		const captured = { ...this.revisions };
		const canReuse =
			context.trackState &&
			!context.fullTree &&
			this.accepted !== undefined &&
			sameParent(this.accepted.context, context.previousSummary);
		const projection = new SummaryTreeBuilder({ groupId: projectionGroup });
		projection.addBlob("manifest.work", createProjectionManifest());
		for (const part of htmlPartIds) {
			if (canReuse && this.accepted?.revisions[part] === captured[part]) {
				projection.addHandle(part, SummaryType.Tree, `/${projectionKey}/${part}`);
			} else {
				this.onSerialize?.(part);
				const partTree = new SummaryTreeBuilder();
				partTree.addBlob("document.html", serializeHtml(fromTree(this.view.root[part])));
				projection.addWithStats(part, partTree);
			}
		}
		return {
			summary: projection.summary,
			onAccepted: context.trackState
				? (accepted) => {
						this.accepted = { context: { ...accepted }, revisions: captured };
					}
				: undefined,
		};
	}

	/** Remove all model listeners; no Fluid document state or application content is mutated. */
	public dispose(): void {
		this.unsubscribeView();
		this.unsubscribeRoot();
		for (const unsubscribe of this.unsubscribeParts.values()) unsubscribe();
		this.unsubscribeParts.clear();
		this.roots.clear();
	}
}

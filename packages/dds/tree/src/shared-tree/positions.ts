/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	EmptyKey,
	type GraphCommit,
	type RevisionTag,
	type UpPath,
	rootFieldKey,
	tagChange,
} from "../core/index.js";
import { intoDelta, TreeStatus } from "../feature-libraries/index.js";
import type { SharedTreeBranch, SharedTreeBranchChange } from "../shared-tree-core/index.js";
import {
	getKernel,
	isArrayNodeSchema,
	treeNodeApi,
	type HistoricalSequencePosition,
	type PositionResolution,
	type ResolvedSequencePosition,
	type TreePositionResolver,
	type TreePositionRevision,
} from "../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { treeNodeFromAnchor } from "../simple-tree/core/index.js";

import { PositionHistory } from "./positionHistory.js";
import {
	type FieldPosition,
	type PositionFieldPath,
	type PositionNodePath,
	PositionMap,
} from "./positionMap.js";
import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { SharedTreeChangeProcessingContext } from "./sharedTreeChangeFamily.js";
import type { SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";
import type { TreeCheckout } from "./treeCheckout.js";

/**
 * Supplies the canonical sequenced state independently of the view's local head.
 */
export interface PositionRevisionSource {
	readonly branchId: string;
	readonly head: GraphCommit<SharedTreeChange>;
	readonly isSequenced: boolean;
}

function nodePath(path: UpPath): PositionNodePath {
	const steps: { field: UpPath["parentField"]; index: number }[] = [];
	for (
		let current: UpPath | undefined = path;
		current !== undefined;
		current = current.parent
	) {
		steps.push({ field: current.parentField, index: current.parentIndex });
	}
	return steps.reverse();
}

function upPath(path: PositionNodePath): UpPath | undefined {
	let parent: UpPath | undefined;
	for (const step of path) {
		parent = { parent, parentField: step.field, parentIndex: step.index };
	}
	return parent;
}

function commitMap(commit: GraphCommit<SharedTreeChange>): PositionMap {
	let map = PositionMap.identity;
	for (const change of commit.change.changes) {
		if (change.type === "schema") {
			return PositionMap.unsupported;
		}
		const delta = intoDelta(tagChange(change.innerChange, commit.revision));
		try {
			map = PositionMap.compose(map, PositionMap.fromDelta(delta));
		} finally {
			for (const build of delta.build ?? []) {
				build.trees.referenceRemoved();
			}
			for (const refresher of delta.refreshers ?? []) {
				refresher.trees.referenceRemoved();
			}
		}
	}
	return map;
}

/**
 * The view-owned index contains no forest snapshots, tracking references, or history-pinning forks.
 */
export class DefaultTreePositionResolver implements TreePositionResolver {
	private readonly history = new PositionHistory();
	private readonly revisions = new Map<string, number>();
	private readonly revisionKeys = new Map<RevisionTag, string>();
	private disposed = false;
	private readonly unsubscribe: readonly (() => void)[];
	private baseline: RevisionTag;

	public constructor(
		private readonly checkout: TreeCheckout,
		branch: SharedTreeBranch<
			SharedTreeEditBuilder,
			SharedTreeChange,
			SharedTreeChangeProcessingContext
		>,
		private readonly idCompressor: IIdCompressor,
	) {
		const commits: GraphCommit<SharedTreeChange>[] = [];
		let base = branch.getHead();
		while (base.parent !== undefined && !base.wasTrimmed) {
			commits.push(base);
			base = base.parent;
		}
		this.record(base.revision);
		this.baseline = base.revision;
		for (const commit of commits.reverse()) {
			this.append(commit);
		}
		this.unsubscribe = [
			branch.events.on("beforeChange", (event) => this.update(event)),
			branch.events.on("ancestryTrimmed", (revisions) => this.trim(revisions)),
		];
	}

	private revisionKey(revision: RevisionTag): string {
		return JSON.stringify([
			this.checkout.getPositionRevisionSource()?.branchId,
			revision === "root" ? "root" : this.idCompressor.decompress(revision),
		]);
	}

	private record(revision: RevisionTag): void {
		const revisionKey = this.revisionKey(revision);
		this.revisions.set(revisionKey, this.history.end);
		this.revisionKeys.set(revision, revisionKey);
	}

	private append(commit: GraphCommit<SharedTreeChange>): void {
		this.history.append(commitMap(commit));
		this.record(commit.revision);
	}

	public update(event: SharedTreeBranchChange<SharedTreeChange>): void {
		if (event.type !== "append" && event.removedCommits.length > 0) {
			this.history.truncate(this.history.end - event.removedCommits.length);
			for (const commit of event.removedCommits) {
				this.removeRevision(commit.revision);
			}
		}
		if (event.type !== "remove") {
			for (const commit of event.newCommits) {
				this.append(commit);
			}
		}
	}

	private removeRevision(revision: RevisionTag): void {
		const revisionKey = this.revisionKeys.get(revision);
		if (revisionKey !== undefined) {
			this.revisions.delete(revisionKey);
			this.revisionKeys.delete(revision);
		}
	}

	public trim(revisions: readonly RevisionTag[]): void {
		let end = this.history.start;
		let baseline = this.baseline;
		for (const revision of revisions) {
			const revisionKey = this.revisionKeys.get(revision);
			if (revisionKey !== undefined) {
				const index = this.revisions.get(revisionKey);
				if (index !== undefined && index >= end) {
					end = index;
					baseline = revision;
				}
				this.removeRevision(revision);
			}
		}
		this.history.trim(end);
		this.removeRevision(this.baseline);
		this.baseline = baseline;
		const baselineKey = this.revisionKey(baseline);
		this.revisionKeys.set(baseline, baselineKey);
		this.revisions.set(baselineKey, end);
	}

	public dispose(): void {
		this.disposed = true;
		for (const off of this.unsubscribe) {
			off();
		}
		this.revisions.clear();
		this.revisionKeys.clear();
		this.history.trim(this.history.end);
	}

	private checkUsable(): void {
		this.checkout.breaker.use();
		if (this.disposed || this.checkout.disposed) {
			throw new UsageError(
				"Cannot use position resolution after the view has been disposed or switched branches.",
			);
		}
	}

	public getCurrentRevision(): TreePositionRevision | undefined {
		this.checkUsable();
		const source = this.checkout.getPositionRevisionSource();
		if (
			source === undefined ||
			!source.isSequenced ||
			source.head.revision === "root" ||
			this.checkout.transaction.size > 0 ||
			source.head !== this.checkout.getPositionHead()
		) {
			return undefined;
		}
		// A baseline can be trimmed before an application captures it. It still describes
		// the current state, so allow that state to become a source for subsequent edits.
		this.record(source.head.revision);
		return this.revisionKey(source.head.revision);
	}

	public resolvePositions(
		revision: TreePositionRevision,
		positions: readonly HistoricalSequencePosition[],
	): PositionResolution {
		this.checkUsable();
		if (this.checkout.transaction.size > 0) {
			throw new UsageError("Cannot resolve historical positions during a transaction.");
		}
		const source = this.checkout.getPositionRevisionSource();
		const start = this.revisions.get(revision);
		const sequenced =
			source?.isSequenced === true
				? this.revisions.get(this.revisionKey(source.head.revision))
				: undefined;
		if (start === undefined || sequenced === undefined || start > sequenced) {
			return { status: "revision-unavailable" };
		}
		const maps = this.history.maps(start);
		return {
			status: "resolved",
			positions: positions.map((position) => this.resolve(position, maps)),
		};
	}

	private resolve(
		position: HistoricalSequencePosition,
		maps: readonly PositionMap[],
	): ResolvedSequencePosition {
		const unavailable = (
			reason: "sequence-deleted" | "invalid-position" | "unsupported-change",
		): ResolvedSequencePosition => ({
			status: "unavailable",
			reason,
		});
		const kernel = getKernel(position.sequence);
		if (!kernel.isHydrated() || kernel.anchorNode.anchorSet !== this.checkout.forest.anchors) {
			throw new UsageError("The position's array must belong to this view.");
		}
		if (kernel.getStatus() !== TreeStatus.InDocument) {
			return unavailable("sequence-deleted");
		}
		if (
			!Number.isSafeInteger(position.index) ||
			position.index < 0 ||
			(position.affinity !== "before" && position.affinity !== "after")
		) {
			return unavailable("invalid-position");
		}
		if (maps.some((map) => !map.supported)) {
			return unavailable("unsupported-change");
		}
		let field: PositionFieldPath = { parent: nodePath(kernel.anchorNode), field: EmptyKey };
		let length = position.sequence.length;
		for (let i = maps.length - 1; i >= 0; i--) {
			const map = maps[i];
			assert(map !== undefined, "Expected a historical position map");
			const source = map.sourceField(field);
			if (source === undefined) {
				return unavailable("invalid-position");
			}
			length -= map.lengthDelta(source);
			field = source;
		}
		if (position.index > length || field.parent[0]?.field !== rootFieldKey) {
			return unavailable("invalid-position");
		}
		let current: FieldPosition | undefined = { field, index: position.index };
		for (const map of maps) {
			current = map.resolve(current, position.affinity);
			if (current === undefined) {
				return unavailable("sequence-deleted");
			}
		}
		if (current.field.field !== EmptyKey || current.field.parent[0]?.field !== rootFieldKey) {
			return unavailable("sequence-deleted");
		}
		const path = upPath(current.field.parent);
		assert(path !== undefined, "An array field must have a parent node");
		const cursor = this.checkout.forest.allocateCursor("resolvePosition");
		try {
			this.checkout.forest.moveCursorToPath(path, cursor);
			const anchor = cursor.buildAnchor();
			try {
				const anchorNode = this.checkout.forest.anchors.locate(anchor);
				assert(anchorNode !== undefined, "Expected a resolved array anchor");
				const node = treeNodeFromAnchor(anchorNode);
				const schema = treeNodeApi.schema(node);
				assert(
					isArrayNodeSchema(schema) && treeNodeApi.is(node, schema),
					"A sequence position must resolve into an array",
				);
				assert(
					current.index >= 0 && current.index <= node.length,
					"Resolved position is outside its array",
				);
				return { status: "resolved", sequence: node, index: current.index };
			} finally {
				this.checkout.forest.anchors.forget(anchor);
			}
		} finally {
			cursor.free();
		}
	}
}

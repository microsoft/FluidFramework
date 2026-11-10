/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	AnchorSet,
	EmptyKey,
	type Anchor,
	type DeltaRoot,
	type DetachedFieldIndex,
	type ChangeRebaser,
	type TaggedChange,
	type FieldKey,
	type RevisionTag,
	type UpPath,
	clonePath,
	combineVisitors,
	compareUpPaths,
	createAnnouncedVisitor,
	getDetachedFieldContainingPath,
	tagChange,
	applyDelta,
	rootField,
	visitDelta,
} from "../core/index.js";
import { intoDelta } from "../feature-libraries/index.js";
import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";

/**
 * A sparse node anchor, with optional gap information for sequence locations.
 */
export interface TrackedLocation {
	anchor: Anchor;
	gap?: {
		index: number;
		readonly affinity: "before" | "after";
	};
	deleted: boolean;
}

/**
 * Replays deltas through core anchors without a forest.
 * Node identity and all structural moves are handled by AnchorSet.
 * The extra visitor only maintains the collapse position if a gap's adjacent node is deleted.
 */
export class LocationReplay {
	private readonly anchors = new AnchorSet();
	private readonly locations: TrackedLocation[] = [];

	public constructor(private readonly detached: DetachedFieldIndex) {}

	public track(path: UpPath, gap?: TrackedLocation["gap"]): TrackedLocation {
		const location: TrackedLocation = {
			anchor: this.anchors.track(path),
			...(gap === undefined ? {} : { gap }),
			deleted: false,
		};
		this.locations.push(location);
		return location;
	}

	public locate(location: TrackedLocation): UpPath | undefined {
		if (location.deleted) {
			return undefined;
		}
		const path = this.anchors.locate(location.anchor);
		return path !== undefined && getDetachedFieldContainingPath(path) === rootField
			? path
			: undefined;
	}

	public apply(delta: DeltaRoot, revision: RevisionTag): void {
		const neighbors = new Map<TrackedLocation, Anchor>();
		for (const location of this.locations) {
			const path = this.locate(location);
			const gap = location.gap;
			if (
				path !== undefined &&
				gap !== undefined &&
				(gap.affinity === "after" || gap.index > 0)
			) {
				// At the end of an array the after-affinity anchor is a virtual node at
				// length. AnchorSet can track this path without materializing a node.
				neighbors.set(
					location,
					this.anchors.track({
						parent: path,
						parentField: EmptyKey,
						parentIndex: gap.index - (gap.affinity === "before" ? 1 : 0),
					}),
				);
			}
		}

		let parent: UpPath | undefined;
		let field: FieldKey | undefined;
		const forEachGap = (update: (gap: NonNullable<TrackedLocation["gap"]>) => void): void => {
			for (const location of this.locations) {
				if (
					!location.deleted &&
					location.gap !== undefined &&
					field === EmptyKey &&
					compareUpPaths(this.anchors.locate(location.anchor), parent)
				) {
					update(location.gap);
				}
			}
		};
		const collapseVisitor = createAnnouncedVisitor({
			enterField: (key) => {
				field = key;
			},
			exitField: () => {
				field = undefined;
			},
			enterNode: (index) => {
				assert(field !== undefined, 0xd6c /* Expected a field while replaying a location */);
				parent = { parent, parentField: field, parentIndex: index };
				field = undefined;
			},
			exitNode: () => {
				assert(parent !== undefined, 0xd6d /* Expected a node while replaying a location */);
				field = parent.parentField;
				parent = parent.parent;
			},
			beforeDetach: ({ start, end }) => {
				forEachGap((gap) => {
					if (gap.index > start) {
						gap.index -= Math.min(gap.index, end) - start;
					}
				});
			},
			beforeAttach: (_source, count, index) => {
				forEachGap((gap) => {
					if (gap.index > index || (gap.index === index && gap.affinity === "after")) {
						gap.index += count;
					}
				});
			},
		});
		const visitor = combineVisitors([collapseVisitor, this.anchors.acquireVisitor()]);
		try {
			visitDelta(delta, visitor, this.detached, revision);
		} finally {
			visitor.free();
		}

		for (const location of this.locations) {
			const neighbor = neighbors.get(location);
			if (neighbor !== undefined) {
				const path = this.anchors.locate(neighbor);
				if (path?.parent !== undefined && getDetachedFieldContainingPath(path) === rootField) {
					assert(location.gap !== undefined, 0xd6e /* Expected a sequence gap */);
					const next = this.anchors.track(path.parent);
					this.anchors.forget(location.anchor);
					location.anchor = next;
					location.gap.index = path.parentIndex + (location.gap.affinity === "before" ? 1 : 0);
				}
				this.anchors.forget(neighbor);
			}
			// Deletion is terminal for a captured location; a later undo does not
			// resurrect a node selection or restore an offset inside deleted content.
			location.deleted ||= this.locate(location) === undefined;
		}
	}

	public snapshot(location: TrackedLocation): UpPath | undefined {
		return clonePath(this.locate(location));
	}

	public dispose(): void {
		for (const location of this.locations) {
			this.anchors.forget(location.anchor);
		}
		this.locations.length = 0;
	}
}

/**
 * Rolls back a commit's repair-root bookkeeping without reconstructing a forest.
 * Call in reverse history order. Rollback inversion, unlike ordinary undo,
 * also destroys content built by the original change.
 */
export function rewindDetachedRoots(
	index: DetachedFieldIndex,
	commit: TaggedChange<SharedTreeChange>,
	rebaser: ChangeRebaser<SharedTreeChange>,
	rollbackRevision: RevisionTag,
): void {
	const inverse = rebaser.invert(commit, true, rollbackRevision);
	for (const change of inverse.changes) {
		if (change.type === "data") {
			const delta = intoDelta(tagChange(change.innerChange, rollbackRevision));
			try {
				applyDelta(
					delta,
					rollbackRevision,
					{
						acquireVisitor: () => createAnnouncedVisitor({}),
					},
					index,
				);
			} finally {
				for (const { trees } of delta.build ?? []) {
					trees.referenceRemoved();
				}
				for (const { trees } of delta.refreshers ?? []) {
					trees.referenceRemoved();
				}
			}
		}
	}
}

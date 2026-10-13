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
	type DeltaFieldMap,
	type DeltaDetachedNodeId,
	type DetachedFieldIndex,
	type FieldKey,
	type RevisionTag,
	type UpPath,
	clonePath,
	combineVisitors,
	compareUpPaths,
	createAnnouncedVisitor,
	getDetachedFieldContainingPath,
	offsetDetachId,
	rootField,
	visitDelta,
} from "../core/index.js";

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
				assert(field !== undefined, "Expected a field while replaying a location");
				parent = { parent, parentField: field, parentIndex: index };
				field = undefined;
			},
			exitNode: () => {
				assert(parent !== undefined, "Expected a node while replaying a location");
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
					assert(location.gap !== undefined, "Expected a sequence gap");
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
 * Reconstructs historical repair-root identities, without reconstructing their contents.
 * Reversing the current index avoids guessing whether an intermediate rename ID already
 * existed at the source revision (which changes the meaning of a rename chain).
 */
export function rewindDetachedRoots(index: DetachedFieldIndex, delta: DeltaRoot): void {
	const attaches: DeltaDetachedNodeId[] = [];
	const detaches: DeltaDetachedNodeId[] = [];
	const range = (id: DeltaDetachedNodeId, count: number): DeltaDetachedNodeId[] =>
		Array.from({ length: count }, (_, i) => offsetDetachId(id, i));
	const add = (id: DeltaDetachedNodeId): void => {
		if (index.tryGetEntry(id) === undefined) {
			index.createEntry(id, undefined);
		}
	};
	const remove = (id: DeltaDetachedNodeId): void => {
		if (index.tryGetEntry(id) !== undefined) {
			index.deleteEntry(id);
		}
	};
	const collect = (fields: DeltaFieldMap | undefined): void => {
		for (const changes of fields?.values() ?? []) {
			for (const mark of changes.marks) {
				if (mark.attach !== undefined) {
					attaches.push(...range(mark.attach, mark.count));
				}
				if (mark.detach !== undefined) {
					detaches.push(...range(mark.detach, mark.count));
				}
				collect(mark.fields);
			}
		}
	};
	collect(delta.fields);
	for (const global of delta.global ?? []) {
		collect(global.fields);
	}
	for (const destroy of delta.destroy ?? []) {
		for (const id of range(destroy.id, destroy.count)) {
			add(id);
		}
	}
	for (const id of attaches) {
		add(id);
	}
	let renames = (delta.rename ?? [])
		.flatMap((rename) =>
			range(rename.oldId, rename.count).map((oldId, i) => ({
				oldId,
				newId: offsetDetachId(rename.newId, i),
			})),
		)
		.filter(({ oldId, newId }) => oldId.major !== newId.major || oldId.minor !== newId.minor);
	while (renames.length > 0) {
		const delayed: typeof renames = [];
		for (const rename of renames) {
			if (
				index.tryGetEntry(rename.newId) !== undefined &&
				index.tryGetEntry(rename.oldId) === undefined
			) {
				remove(rename.newId);
				add(rename.oldId);
			} else {
				delayed.push(rename);
			}
		}
		assert(
			delayed.length < renames.length,
			"Reversing detached-root renames must make progress",
		);
		renames = delayed;
	}
	for (const id of detaches) {
		remove(id);
	}
	for (const build of delta.build ?? []) {
		for (const id of range(build.id, build.trees.topLevelLength)) {
			remove(id);
		}
	}
}

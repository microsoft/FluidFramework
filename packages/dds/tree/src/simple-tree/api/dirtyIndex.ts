/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	createAnnouncedVisitor,
	CursorLocationType,
	type AnnouncedVisitor,
	type FieldKey,
	type IEditableForest,
	type UpPath,
} from "../../core/index.js";
import { TreeNode, treeNodeFromAnchor } from "../core/index.js";
import type { TreeViewAlpha } from "./tree.js";
import type { SchematizingSimpleTreeView } from "../../shared-tree/index.js";
import type { ImplicitFieldSchema } from "../fieldSchema.js";

/**
 * The status of a node in a that has been {@link trackDirtyNodes | tracked for changes}.
 * @remarks Nodes can be marked "new", "changed", or "moved", with "new" taking precedence over "changed" and "changed" taking precedence over "moved".
 * * "new": The node was added.
 * * "changed": A direct child was updated, added, removed, or moved (and the node is not "new").
 * * "moved": The node was moved between/within arrays (and the node is not "new" or "changed").
 * @alpha
 */
export type DirtyTreeStatus = "new" | "changed" | "moved";

/**
 * A map-like interface for tracking the {@link DirtyTreeStatus | status} of nodes that have been {@link trackDirtyNodes | tracked for changes}.
 * @privateRemarks TODO: Replace this with `MapGetSet` from `@fluidframework/core-interfaces`.
 * @alpha
 */
export interface DirtyTreeMap {
	get(node: TreeNode): DirtyTreeStatus | undefined;
	set(node: TreeNode, status: DirtyTreeStatus): void;
}

/**
 * Registers a visitor on the view's forest that tracks which nodes are dirty.
 * @param view - The view to track dirty nodes on
 * @param dirty - A {@link DirtyTreeMap | map} that will be updated over time to reflect the {@link DirtyTreeStatus | status} of nodes as they change.
 * Nodes that have not changed will not be inserted/updated in the map.
 * @returns a cleanup function that should be called when the tracking is no longer needed.
 * @example
 * ```typescript
 * const dirty = new Map<TreeNode, DirtyTreeStatus>();
 * const stopTracking = trackDirtyNodes(view, dirty);
 * // ... make changes to the view ...
 * console.log(`The root of the tree is ${dirty.get(view.root) ?? "unchanged"}`);
 * stopTracking();
 * ```
 * @alpha
 */
export function trackDirtyNodes(
	view: TreeViewAlpha<ImplicitFieldSchema>,
	dirty: DirtyTreeMap,
): () => void {
	const forest = (view as SchematizingSimpleTreeView<ImplicitFieldSchema>).checkout.forest;
	const announcedVisitor = (): AnnouncedVisitor => createDirtyVisitor(forest, dirty);
	forest.registerAnnouncedVisitor(announcedVisitor);
	return () => {
		forest.deregisterAnnouncedVisitor(announcedVisitor);
	};
}

function createDirtyVisitor(forest: IEditableForest, dirty: DirtyTreeMap): AnnouncedVisitor {
	// When cursor is in Fields mode, `parentField` is the field and `parent` is the parent node above that field (if any).
	// When cursor is in Nodes mode, `parent` is the current node and `parentField` is undefined.
	let parentField: FieldKey | undefined;
	let parent: UpPath | undefined;

	return createAnnouncedVisitor({
		beforeDetach: (src) => {
			assert(parent !== undefined, "Expected node");
			assert(parentField !== undefined, "Expected field");
			for (let parentIndex = src.start; parentIndex < src.end; parentIndex++) {
				const path: UpPath = {
					parent,
					parentField,
					parentIndex,
				};
				// The only way a detached node can be re-attached (and become visible/usable again) is via a move, so mark it as moved ahead of time.
				const node = getNodeAtPath(forest, path);
				if (node !== undefined && dirty.get(node) === undefined) {
					// Only mark the node as moved if it is not already marked as something else.
					dirty.set(node, "moved");
				}
				// Mark the parent as changed unless it is already marked as new.
				const parentNode = getNodeAtPath(forest, parent);
				if (parentNode !== undefined && dirty.get(parentNode) !== "new") {
					dirty.set(parentNode, "changed");
				}
			}
		},
		afterAttach: (_, dst) => {
			assert(parent !== undefined, "Expected node");
			assert(parentField !== undefined, "Expected field");
			for (let parentIndex = dst.start; parentIndex < dst.end; parentIndex++) {
				const path: UpPath = {
					parent,
					parentField,
					parentIndex,
				};
				const node = getNodeAtPath(forest, path);
				if (node !== undefined && dirty.get(node) === undefined) {
					// Only mark the node as new if it is not already marked as something else - this ensures that a moved node is not marked as new (since nodes are marked move when detached).
					dirty.set(node, "new");
				}
				// Mark the parent as changed unless it is already marked as new.
				const parentNode = getNodeAtPath(forest, parent);
				if (parentNode !== undefined && dirty.get(parentNode) !== "new") {
					dirty.set(parentNode, "changed");
				}
			}
		},
		enterNode(index: number): void {
			assert(parentField !== undefined, "Expected field");
			parent = {
				parent,
				parentField,
				parentIndex: index,
			};
			parentField = undefined;
		},
		exitNode(): void {
			assert(parent !== undefined, "Expected node");
			parentField = parent.parentField;
			parent = parent.parent;
		},
		enterField: (key: FieldKey) => {
			parentField = key;
		},
		exitField(): void {
			parentField = undefined;
		},
	});
}

function getNodeAtPath(forest: IEditableForest, path: UpPath): TreeNode | undefined {
	const cursor = forest.allocateCursor();
	forest.moveCursorToPath(path, cursor);
	assert(cursor.mode === CursorLocationType.Nodes, 0xa9c /* attach should happen in a node */);
	const anchor = cursor.buildAnchor();
	const anchorNode = forest.anchors.locate(anchor);
	cursor.free();
	if (anchorNode !== undefined) {
		const node = treeNodeFromAnchor(anchorNode);
		if (node instanceof TreeNode) {
			return node;
		}
	}
	return undefined;
}

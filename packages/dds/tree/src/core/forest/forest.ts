/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { Listenable } from "@fluidframework/core-interfaces/internal";
import type { FieldKey, TreeStoredSchemaSubscription } from "../schema-stored/index.js";
import {
	type Anchor,
	type AnchorSet,
	type AnnouncedVisitor,
	type DetachedField,
	type ITreeCursor,
	type ITreeCursorSynchronous,
	type TreeChunk,
	type UpPath,
	detachedFieldAsKey,
	rootField,
} from "../tree/index.js";

import type { IEditableForest } from "./editableForest.js";

/**
 * APIs for forest designed so the implementation can be copy on write,
 * or mutate in place, and we can ensure no references are dangling into the forest to allow this.
 *
 * This results in rather manual memory management,
 * but makes it practical to provide highly optimized implementations,
 * for example WASM powered binary formats that can track reference counts and only copy when needed.
 */

/**
 * Events for {@link IForestSubscription}.
 *
 * TODO: consider having before and after events per subtree instead while applying anchor (and this just shows what happens at the root).
 */
export interface ForestEvents {
	/**
	 * A new root field was just created in this forest.
	 */
	afterRootFieldCreated(key: FieldKey): void;

	/**
	 * The forest is about to be changed.
	 * Emitted before each change in a batch of changes.
	 * @remarks
	 * This is the last chance for users of the forest to remove cursors from the forest before the edit.
	 * Removing these cursors is important since they are not allowed to live across edits and
	 * not clearing them can lead to corruption of in memory structures.
	 */
	beforeChange(): void;
}

/**
 * Invalidates whenever the tree content changes.
 * For now (might change later) downloading new parts of the forest counts as a change.
 * Not invalidated when schema changes.
 *
 * When invalidating, all outstanding cursors must be freed or cleared.
 */
export interface IForestSubscription {
	/**
	 * Events for this forest.
	 */
	readonly events: Listenable<ForestEvents>;

	/**
	 * Set of anchors this forest is tracking.
	 *
	 * To keep these anchors usable, this AnchorSet must be updated / rebased for any changes made to the forest.
	 * It is the responsibility of the caller of the forest-editing methods to do this, not the forest itself.
	 * The caller performs these updates because it has more semantic knowledge about the edits, which can be needed to
	 * update the anchors in a semantically optimal way.
	 */
	readonly anchors: AnchorSet;

	/**
	 * Create an independent copy of this forest, that uses the provided schema and anchors.
	 *
	 * The new copy will not invalidate observers (dependents) of the old one.
	 */
	clone(schema: TreeStoredSchemaSubscription, anchors: AnchorSet): IEditableForest;

	/**
	 * Generate a TreeChunk for the content in the given field cursor.
	 * This can be used to chunk data that is then inserted into the forest.
	 *
	 * @remarks
	 * Like {@link chunkField}, but forces the results into a single TreeChunk.
	 * While any TreeChunk is compatible with any forest, this method creates one optimized for this specific forest.
	 * The provided data must be compatible with the forest's current schema.
	 */
	chunkField(cursor: ITreeCursorSynchronous): TreeChunk;

	/**
	 * Allocates a cursor in the "cleared" state.
	 * @param source - optional string identifying the source of the cursor for debugging purposes when cursors are not properly cleaned up.
	 */
	allocateCursor(source?: string): ITreeSubscriptionCursor;

	/**
	 * Frees an Anchor, stopping tracking its position across edits.
	 */
	forgetAnchor(anchor: Anchor): void;

	/**
	 * It is an error not to free `cursorToMove` before the next edit.
	 * Must provide a `cursorToMove` from this subscription (acquired via `allocateCursor`).
	 */
	tryMoveCursorToNode(
		destination: Anchor,
		cursorToMove: ITreeSubscriptionCursor,
	): TreeNavigationResult;

	/**
	 * It is an error not to free `cursorToMove` before the next edit.
	 * Must provide a `cursorToMove` from this subscription (acquired via `allocateCursor`).
	 */
	tryMoveCursorToField(
		destination: FieldAnchor,
		cursorToMove: ITreeSubscriptionCursor,
	): TreeNavigationResult;

	/**
	 * Set `cursorToMove` to the {@link CursorLocationType.node} described by path.
	 * This is NOT a relative move: current position is discarded.
	 * Path must point to existing node.
	 */
	moveCursorToPath(destination: UpPath, cursorToMove: ITreeSubscriptionCursor): void;

	/**
	 * The cursor is moved to a special dummy node above the detached fields.
	 * This dummy node can be used to read the detached fields,
	 * but other operations (such as inspecting the dummy node's type or path) should not be relied upon.
	 * While this method does not return an {@link ITreeSubscriptionCursor}, similar restrictions apply to its use:
	 * the returned cursor must not used after any edits are made to the forest.
	 */
	getCursorAboveDetachedFields(): ITreeCursorSynchronous;

	/**
	 * True if there are no nodes in the forest at all.
	 *
	 * @remarks
	 * This means no nodes under any detached field, not just the special document root one.
	 */
	readonly isEmpty: boolean;

	/**
	 * Obtains and registers an {@link AnnouncedVisitor} that responds to changes on the forest.
	 */
	registerAnnouncedVisitor(visitor: () => AnnouncedVisitor): void;

	/**
	 * Deregister the given visitor so that it stops responding to updates
	 */
	deregisterAnnouncedVisitor(visitor: () => AnnouncedVisitor): void;
}

/**
 * @param field - defaults to {@link rootField}.
 * @returns anchor to `field`.
 */
export function rootAnchor(field: DetachedField = rootField): FieldAnchor {
	return {
		parent: undefined,
		fieldKey: detachedFieldAsKey(field),
	};
}

/**
 * @param field - defaults to {@link rootField}.
 * @returns anchor to `field`.
 */
export function moveToDetachedField(
	forest: IForestSubscription,
	cursorToMove: ITreeSubscriptionCursor,
	field: DetachedField = rootField,
): void {
	const result = forest.tryMoveCursorToField(rootAnchor(field), cursorToMove);
	assert(
		result === TreeNavigationResult.Ok,
		0x42d /* Navigation to detached fields should never fail */,
	);
}

/**
 * Anchor to a field.
 * This is structurally based on the parent, so it will move only as the parent moves.
 */
export interface FieldAnchor {
	/**
	 * Node above this field.
	 * If `undefined`, field is a detached field.
	 */
	parent: Anchor | undefined;
	fieldKey: FieldKey;
}

/**
 * ITreeCursor supporting IForestSubscription and its changes over time.
 */
export interface ITreeSubscriptionCursor extends ITreeCursor {
	/**
	 * @param source - optional string identifying the source of the cursor for debugging purposes when cursors are not properly cleaned up.
	 * @returns an independent copy of this cursor at the same location in the tree.
	 */
	fork(source?: string): ITreeSubscriptionCursor;

	/**
	 * Release any resources this cursor is holding onto.
	 * After doing this, further use of this object other than reading `state` is forbidden (undefined behavior).
	 */
	free(): void;

	/**
	 * Release any resources this cursor is holding onto.
	 * After doing this, further use of this object other than reading `state` or passing to `tryGet`
	 * or calling `free` is forbidden (undefined behavior).
	 */
	clear(): void;

	/**
	 * Construct an `Anchor` which the IForestSubscription will keep rebased to `current`.
	 * Note that maintaining an Anchor has cost: free them to stop incurring that cost.
	 *
	 * Only valid when `mode` is `Nodes`.
	 */
	buildAnchor(): Anchor;

	/**
	 * Construct a `FieldAnchor` which the IForestSubscription will keep rebased to `current`.
	 * Note that maintaining an Anchor has cost: free them to stop incurring that cost.
	 *
	 * Only valid when `mode` is `Fields`.
	 */
	buildFieldAnchor(): FieldAnchor;

	/**
	 * Current state.
	 */
	readonly state: ITreeSubscriptionCursorState;

	/**
	 * @returns location within parent field or range.
	 */
	// TODO: maybe support this.
	// getParentInfo(id: NodeId): TreeLocation;
}

/**
 */
export enum ITreeSubscriptionCursorState {
	/**
	 * On the current revision of the forest.
	 */
	Current,
	/**
	 * Empty, but can be reused.
	 */
	Cleared,
	/**
	 * Freed and must not be used.
	 */
	Freed,
}

/**
 */
export const enum TreeNavigationResult {
	/**
	 * Attempt to navigate cursor to a key or index that is outside the client's view.
	 */
	NotFound = -1,

	/**
	 * Attempt to navigate cursor to a portion of the tree that has not yet been loaded.
	 */
	Pending = 0,

	/**
	 * ITreeReader successfully navigated to the desired node.
	 */
	Ok = 1,
}

/**
 * TreeNavigationResult, but never "Pending".
 * Can be used when data is never pending.
 */
export type SynchronousNavigationResult =
	| TreeNavigationResult.Ok
	| TreeNavigationResult.NotFound;

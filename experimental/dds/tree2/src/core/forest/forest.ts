/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ISubscribable } from "../../events";
import { Dependee } from "../dependency-tracking";
import { StoredSchemaRepository, FieldKey } from "../schema-stored";
import {
	Anchor,
	AnchorSet,
	Delta,
	DetachedField,
	detachedFieldAsKey,
	ITreeCursor,
	rootField,
} from "../tree";
import type { IEditableForest } from "./editableForest";

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
 * @alpha
 */
export interface ForestEvents {
	/**
	 * Delta is about to be applied to forest.
	 */
	beforeDelta(delta: Delta.Root): void;

	/**
	 * Delta was just applied to forest.
	 */
	afterDelta(delta: Delta.Root): void;
}

/**
 * Invalidates whenever `current` changes.
 * For now (might change later) downloading new parts of the forest counts as a change.
 *
 * When invalidating, all outstanding cursors must be freed or cleared.
 * @alpha
 */
export interface IForestSubscription extends Dependee, ISubscribable<ForestEvents> {
	/**
	 * Create an independent copy of this forest, that uses the provided schema and anchors.
	 *
	 * The new copy will not invalidate observers (dependents) of the old one.
	 */
	clone(schema: StoredSchemaRepository, anchors: AnchorSet): IEditableForest;

	/**
	 * Schema used within this forest.
	 * All data must conform to these schema.
	 *
	 * The root's schema is tracked under {@link rootFieldKey}.
	 */
	readonly schema: StoredSchemaRepository;

	/**
	 * Allocates a cursor in the "cleared" state.
	 */
	allocateCursor(): ITreeSubscriptionCursor;

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
	 * True if there are no nodes in the forest at all.
	 */
	readonly isEmpty: boolean;
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
 * @alpha
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
 * @alpha
 */
export interface ITreeSubscriptionCursor extends ITreeCursor {
	/**
	 * @returns an independent copy of this cursor at the same location in the tree.
	 */
	fork(): ITreeSubscriptionCursor;

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
 * @alpha
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
 * @alpha
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
export type SynchronousNavigationResult = TreeNavigationResult.Ok | TreeNavigationResult.NotFound;

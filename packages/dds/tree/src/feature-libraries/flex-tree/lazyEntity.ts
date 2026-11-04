/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	type ITreeCursorSynchronous,
	type ITreeSubscriptionCursor,
	ITreeSubscriptionCursorState,
	TreeNavigationResult,
} from "../../core/index.js";
import { type IDisposable, disposeSymbol } from "../../util/index.js";

import type { Context } from "./context.js";
import type { FlexTreeEntity } from "./flexTreeTypes.js";

/**
 * Assert `entity` is not deleted.
 * @privateRemarks
 * This can be faster than getting the tree status and checking that since that can require computing removed vs deleted.
 * TODO: provide a non implementation dependent way to leverage this optimization.
 */
export function assertFlexTreeEntityNotFreed(entity: FlexTreeEntity): void {
	assert(entity instanceof LazyEntity, 0x8c9 /* unexpected implementation */);
	assert(!entity.isFreed(), 0x8ca /* Use after free */);
}

/**
 * Common lifetime and cursor-access contract for hydrated FlexTree implementations.
 * Node and field implementations supply their identity separately from resource ownership.
 */
export abstract class LazyEntity {
	public abstract readonly context: Context;
	public abstract borrowCursor(): ITreeCursorSynchronous;
	public abstract isFreed(): boolean;
}

/**
 * Owns a persistent cursor and anchor, registered with its context for edit preparation and disposal.
 * Nodes inherit this implementation; resource-owning fields compose it beneath their shared field base.
 */
export abstract class AnchoredEntity<TAnchor = unknown>
	extends LazyEntity
	implements IDisposable
{
	readonly #lazyCursor: ITreeSubscriptionCursor;
	public readonly anchor: TAnchor;

	protected constructor(
		public override readonly context: Context,
		cursor: ITreeSubscriptionCursor,
		anchor: TAnchor,
	) {
		super();
		this.anchor = anchor;
		this.#lazyCursor = cursor.fork("LazyEntity Fork");
		context.withCursors.add(this);
		this.context.withAnchors.add(this);
	}

	public override borrowCursor(): ITreeCursorSynchronous {
		return this.cursor as ITreeCursorSynchronous;
	}

	public [disposeSymbol](): void {
		this.#lazyCursor.free();
		this.context.withCursors.delete(this);
		this.forgetAnchor();
		this.context.withAnchors.delete(this);
	}

	public prepareForEdit(): void {
		this.#lazyCursor.clear();
		this.context.withCursors.delete(this);
	}

	public override isFreed(): boolean {
		return this.#lazyCursor.state === ITreeSubscriptionCursorState.Freed;
	}

	/**
	 * Validates this entity's derived state and external references can be safely used.
	 * {@link AnchoredEntity.cursor} does sufficient validation on its own, so only cases which don't use the cursor must call this.
	 * @remarks
	 * Call this before accessing cached or anchor-derived data that bypasses the cursor getter's lifetime and broken-forest checks.
	 * This check is redundant when the access uses {@link AnchoredEntity.cursor}.
	 *
	 * @throws If this entity has been freed.
	 * @throws A usage error if the cursor is not current and the forest is broken.
	 */
	protected ensureValidForAccess(): void {
		assert(!this.isFreed(), 0xd93 /* Cannot access a freed FlexTree entity */);
		if (this.#lazyCursor.state !== ITreeSubscriptionCursorState.Current) {
			this.context.checkout.forest.breaker.use();
		}
	}

	/**
	 * Gets the current cursor for this entity, moving it to the anchor if necessary.
	 * @remarks
	 * Includes validation that it is legal to access this entity via its cursor.
	 * @privateRemarks
	 * This method implicitly relies on the forest to break, clear or continue to support its cursors if the forest becomes broken.
	 */
	public get cursor(): ITreeSubscriptionCursor {
		if (this.#lazyCursor.state !== ITreeSubscriptionCursorState.Current) {
			assert(
				this.#lazyCursor.state === ITreeSubscriptionCursorState.Cleared,
				0x778 /* Unset cursor should be in cleared state */,
			);
			assert(
				this.anchor !== undefined,
				0x779 /* FlexTree should have an anchor if it does not have a cursor */,
			);
			const result = this.tryMoveCursorToAnchor(this.#lazyCursor);
			assert(
				result === TreeNavigationResult.Ok,
				0x77a /* It is invalid to access a FlexTree node which no longer exists */,
			);
			this.context.withCursors.add(this);
		}

		return this.#lazyCursor;
	}

	protected abstract tryMoveCursorToAnchor(
		cursor: ITreeSubscriptionCursor,
	): TreeNavigationResult;

	/**
	 * Called when disposing of this target, iff it has an anchor.
	 */
	protected abstract forgetAnchor(): void;
}

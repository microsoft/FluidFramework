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

import type {
	Context,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used by TSDoc links.
	FlexTreeHydratedContext,
} from "./context.js";
import type {
	FlexTreeEntity,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used by TSDoc links.
	FlexTreeField,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used by TSDoc links.
	FlexTreeNode,
} from "./flexTreeTypes.js";

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
 * A {@link FlexTreeEntity} in a {@link FlexTreeHydratedContext | hydrated} tree.
 * @remarks
 * Base class for all {@link FlexTreeHydratedContext | hydrated} {@link FlexTreeNode} and {@link FlexTreeField} implementations.
 *
 * The {@link LazyEntity.context | context} manages instance lifetimes and cursor access.
 * Node and field instances may own their own navigation resources or borrow them from a containing node.
 *
 * The name "Lazy" comes from the fact that this implementation of the flex-tree types lazily constructs nodes when first accessed.
 */
export abstract class LazyEntity {
	/**
	 * The context that supplies the forest and manages this instance's lifetime.
	 */
	public abstract readonly context: Context;

	/**
	 * Borrows a cursor positioned on this instance's node or field.
	 * @remarks
	 * The instance must not be freed. The caller must restore the cursor's original position
	 * before using other tree APIs, and must not retain it across edits or other tree API calls.
	 * Borrowing does not transfer ownership: the caller must not free the cursor.
	 */
	public abstract borrowCursor(): ITreeCursorSynchronous;

	/**
	 * Reports whether this instance's lifetime has ended.
	 * A freed instance cannot be used to access forest content or edit the tree.
	 * Removal from the document alone does not end its lifetime.
	 */
	public abstract isFreed(): boolean;
}

/**
 * A context-managed owner of a persistent cursor and an anchor used to recover its position after edits.
 * @typeParam TAnchor - The node or field anchor representation used by the subclass.
 * @remarks
 * Nodes inherit this implementation; resource-owning fields compose it beneath their shared field base.
 */
export abstract class AnchoredEntity<TAnchor = unknown>
	extends LazyEntity
	implements IDisposable
{
	readonly #lazyCursor: ITreeSubscriptionCursor;
	/**
	 * The owned anchor used to recover the cursor until disposal.
	 */
	public readonly anchor: TAnchor;

	/**
	 * Registers navigation resources with the context.
	 * @param context - The context whose forest contains the anchored location.
	 * @param cursor - A current cursor at that location. It is forked; ownership stays with the caller.
	 * @param anchor - An anchor for the same location. Ownership transfers to this instance.
	 */
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

	/**
	 * Frees the cursor, releases the anchor, and unregisters this instance from its context.
	 * Must be called at most once.
	 */
	public [disposeSymbol](): void {
		this.#lazyCursor.free();
		this.context.withCursors.delete(this);
		this.forgetAnchor();
		this.context.withAnchors.delete(this);
	}

	/**
	 * Clears the live cursor before a forest edit, retaining the anchor for later recovery.
	 * The instance must not be freed.
	 */
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
	 * The instance must not be freed.
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

	/**
	 * Attempts to position the supplied cursor at this instance's anchor.
	 * @param cursor - A cleared cursor from this context's forest.
	 * @returns Whether the anchored location was found.
	 */
	protected abstract tryMoveCursorToAnchor(
		cursor: ITreeSubscriptionCursor,
	): TreeNavigationResult;

	/**
	 * Releases the owned anchor and any subclass state tied to it during disposal.
	 * Called after the cursor has been freed.
	 */
	protected abstract forgetAnchor(): void;
}

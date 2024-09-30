/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	type ITreeSubscriptionCursor,
	ITreeSubscriptionCursorState,
	TreeNavigationResult,
} from "../../core/index.js";
import { type IDisposable, disposeSymbol } from "../../util/index.js";

import type { Context } from "./context.js";
import {
	type FlexTreeEntity,
	type FlexTreeEntityKind,
	flexTreeMarker,
} from "./flexTreeTypes.js";

export const prepareForEditSymbol = Symbol("prepareForEdit");
export const isFreedSymbol = Symbol("isFreed");
export const tryMoveCursorToAnchorSymbol = Symbol("tryMoveCursorToAnchor");
export const forgetAnchorSymbol = Symbol("forgetAnchor");
export const cursorSymbol = Symbol("cursor");
/**
 * Symbol used to access the (generic) anchor of a {@link LazyEntity}.
 */
export const anchorSymbol = Symbol("anchor");

/**
 * Assert `entity` is not deleted.
 * @privateRemarks
 * This can be faster than getting the tree status and checking that since that can require computing removed vs deleted.
 * TODO: provide a non implementation dependent way to leverage this optimization.
 */
export function assertFlexTreeEntityNotFreed(entity: FlexTreeEntity): void {
	assert(entity instanceof LazyEntity, 0x8c9 /* unexpected implementation */);
	assert(!entity[isFreedSymbol](), 0x8ca /* Use after free */);
}

/**
 * This is a base class for lazy (cursor based) UntypedEntity implementations, which uniformly handles cursors and anchors.
 */
export abstract class LazyEntity<TAnchor = unknown> implements FlexTreeEntity, IDisposable {
	readonly #lazyCursor: ITreeSubscriptionCursor;
	public readonly [anchorSymbol]: TAnchor;

	protected constructor(
		public readonly context: Context,
		cursor: ITreeSubscriptionCursor,
		anchor: TAnchor,
	) {
		this[anchorSymbol] = anchor;
		this.#lazyCursor = cursor.fork("LazyEntity Fork");
		context.withCursors.add(this);
		this.context.withAnchors.add(this);
	}

	public abstract boxedIterator(): IterableIterator<FlexTreeEntity>;
	public abstract get [flexTreeMarker](): FlexTreeEntityKind;

	public [disposeSymbol](): void {
		this.#lazyCursor.free();
		this.context.withCursors.delete(this);
		this[forgetAnchorSymbol]();
		this.context.withAnchors.delete(this);
	}

	public [prepareForEditSymbol](): void {
		this.#lazyCursor.clear();
		this.context.withCursors.delete(this);
	}

	public [isFreedSymbol](): boolean {
		return this.#lazyCursor.state === ITreeSubscriptionCursorState.Freed;
	}

	public get [cursorSymbol](): ITreeSubscriptionCursor {
		if (this.#lazyCursor.state !== ITreeSubscriptionCursorState.Current) {
			assert(
				this.#lazyCursor.state === ITreeSubscriptionCursorState.Cleared,
				0x778 /* Unset cursor should be in cleared state */,
			);
			assert(
				this[anchorSymbol] !== undefined,
				0x779 /* FlexTree should have an anchor if it does not have a cursor */,
			);
			const result = this[tryMoveCursorToAnchorSymbol](this.#lazyCursor);
			assert(
				result === TreeNavigationResult.Ok,
				0x77a /* It is invalid to access a FlexTree node which no longer exists */,
			);
			this.context.withCursors.add(this);
		}
		return this.#lazyCursor;
	}

	protected abstract [tryMoveCursorToAnchorSymbol](
		cursor: ITreeSubscriptionCursor,
	): TreeNavigationResult;

	/**
	 * Called when disposing of this target, iff it has an anchor.
	 */
	protected abstract [forgetAnchorSymbol](): void;
}

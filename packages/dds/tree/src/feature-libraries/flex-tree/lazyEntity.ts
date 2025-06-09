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
 * This is a base class for lazy (cursor based) UntypedEntity implementations, which uniformly handles cursors and anchors.
 */
export abstract class LazyEntity<TAnchor = unknown> implements FlexTreeEntity, IDisposable {
	readonly #lazyCursor: ITreeSubscriptionCursor;
	public readonly anchor: TAnchor;

	protected constructor(
		public readonly context: Context,
		cursor: ITreeSubscriptionCursor,
		anchor: TAnchor,
	) {
		this.anchor = anchor;
		this.#lazyCursor = cursor.fork("LazyEntity Fork");
		context.withCursors.add(this);
		this.context.withAnchors.add(this);
	}

	public abstract boxedIterator(): IterableIterator<FlexTreeEntity>;
	public abstract get [flexTreeMarker](): FlexTreeEntityKind;

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

	public isFreed(): boolean {
		return this.#lazyCursor.state === ITreeSubscriptionCursorState.Freed;
	}

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

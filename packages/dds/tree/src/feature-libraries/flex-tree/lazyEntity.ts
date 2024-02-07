/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	TreeNavigationResult,
	ITreeSubscriptionCursor,
	ITreeSubscriptionCursorState,
} from "../../core/index.js";
import { disposeSymbol, IDisposable } from "../../util/index.js";
import { Context } from "./context.js";
import { FlexTreeEntity, FlexTreeEntityKind, TreeStatus, flexTreeMarker } from "./flexTreeTypes.js";

/**
 * Like {@link makePropertyNotEnumerable}, but less type safe so it works on private properties.
 */
export function makePrivatePropertyNotEnumerable(
	target: object,
	key: string | symbol | number,
): void {
	assert(
		Object.getOwnPropertyDescriptor(target, key)?.enumerable === true,
		0x777 /* missing property or not enumerable */,
	);
	Object.defineProperty(target, key, { enumerable: false });
}

export const prepareForEditSymbol = Symbol("prepareForEdit");
export const isFreedSymbol = Symbol("isFreed");
export const tryMoveCursorToAnchorSymbol = Symbol("tryMoveCursorToAnchor");
export const forgetAnchorSymbol = Symbol("forgetAnchor");
export const cursorSymbol = Symbol("cursor");
export const anchorSymbol = Symbol("anchor");

/**
 * Assert `entity` is not deleted.
 * @privateRemarks
 * This can be faster than getting the tree status and checking that since that can require computing removed vs deleted.
 * TODO: provide a non implementation dependent way to leverage this optimization.
 */
export function assertFlexTreeEntityNotFreed(entity: FlexTreeEntity): void {
	assert(entity instanceof LazyEntity, "unexpected implementation");
	assert(!entity[isFreedSymbol](), "Use after free");
}

/**
 * This is a base class for lazy (cursor based) UntypedEntity implementations, which uniformly handles cursors and anchors.
 */
export abstract class LazyEntity<TSchema = unknown, TAnchor = unknown>
	implements FlexTreeEntity<TSchema>, IDisposable
{
	readonly #lazyCursor: ITreeSubscriptionCursor;
	public readonly [anchorSymbol]: TAnchor;

	protected constructor(
		public readonly context: Context,
		public readonly schema: TSchema,
		cursor: ITreeSubscriptionCursor,
		anchor: TAnchor,
	) {
		this[anchorSymbol] = anchor;
		this.#lazyCursor = cursor.fork();
		context.withCursors.add(this);
		this.context.withAnchors.add(this);
	}

	public abstract boxedIterator(): IterableIterator<FlexTreeEntity>;
	public abstract get [flexTreeMarker](): FlexTreeEntityKind;

	public abstract treeStatus(): TreeStatus;

	public [disposeSymbol](): void {
		this.#lazyCursor.free();
		this.context.withCursors.delete(this);
		this[forgetAnchorSymbol](this[anchorSymbol]);
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
				0x779 /* EditableTree should have an anchor if it does not have a cursor */,
			);
			const result = this[tryMoveCursorToAnchorSymbol](this[anchorSymbol], this.#lazyCursor);
			assert(
				result === TreeNavigationResult.Ok,
				0x77a /* It is invalid to access an EditableTree node which no longer exists */,
			);
			this.context.withCursors.add(this);
		}
		return this.#lazyCursor;
	}

	protected abstract [tryMoveCursorToAnchorSymbol](
		anchor: TAnchor,
		cursor: ITreeSubscriptionCursor,
	): TreeNavigationResult;

	/**
	 * Called when disposing of this target, iff it has an anchor.
	 */
	protected abstract [forgetAnchorSymbol](anchor: TAnchor): void;
}

/**
 * Prevent Entities from inheriting members from Object.prototype including:
 * '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__', '__proto__',
 * 'hasOwnProperty', 'isPrototypeOf', 'valueOf', 'propertyIsEnumerable', 'toLocaleString' and 'toString'.
 *
 * This opens up more options for field names on struct nodes.
 */
Object.setPrototypeOf(LazyEntity.prototype, null);

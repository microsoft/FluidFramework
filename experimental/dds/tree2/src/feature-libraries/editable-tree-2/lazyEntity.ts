/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	TreeNavigationResult,
	ITreeSubscriptionCursor,
	ITreeSubscriptionCursorState,
} from "../../core";
import { TreeStatus } from "../editable-tree";
import { fail, disposeSymbol, IDisposable } from "../../util";
import { Context } from "./context";
import { Tree, boxedIterator } from "./editableTreeTypes";

/**
 * Declare an enumerable own property on `T` under the key `key` using the implementation of one on `from`.
 */
export function makePropertyEnumerableOwn<T extends object>(
	target: T,
	key: keyof T,
	from: object,
): void {
	assert(
		Object.getOwnPropertyDescriptor(target, key) === undefined,
		0x776 /* preexisting property */,
	);

	const descriptor = Object.getOwnPropertyDescriptor(from, key) ?? fail("missing property");
	Object.defineProperty(target, key, { ...descriptor, enumerable: true });
}

/**
 * Modify a property on `T` under the key `key` to be not-enumerable
 */
export function makePropertyNotEnumerable<T extends object>(target: T, key: keyof T): void {
	makePrivatePropertyNotEnumerable(target, key);
}

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
export const lazyCursorSymbol = Symbol("lazyCursor");
export const anchorSymbol = Symbol("anchor");

/**
 * This is a base class for lazy (cursor based) UntypedEntity implementations, which uniformly handles cursors and anchors.
 */
export abstract class LazyEntity<TSchema = unknown, TAnchor = unknown>
	implements Tree<TSchema>, IDisposable
{
	// 'lazyCursorSymbol' should be private, but TypeScript does not include private
	// symbol in 'keyof T', which is required for 'makePropertyEnumerableOwn'.
	public readonly [lazyCursorSymbol]: ITreeSubscriptionCursor;

	public readonly [anchorSymbol]: TAnchor;

	protected constructor(
		public readonly context: Context,
		public readonly schema: TSchema,
		cursor: ITreeSubscriptionCursor,
		anchor: TAnchor,
	) {
		this[anchorSymbol] = anchor;
		this[lazyCursorSymbol] = cursor.fork();
		context.withCursors.add(this);
		this.context.withAnchors.add(this);

		// Setup JS Object API:
		makePropertyNotEnumerable(this, "context");
		makePropertyNotEnumerable(this, "schema");
		makePropertyNotEnumerable(this, lazyCursorSymbol);
		makePropertyNotEnumerable(this, anchorSymbol);
	}

	public abstract [boxedIterator](): IterableIterator<Tree>;

	public abstract treeStatus(): TreeStatus;

	public [disposeSymbol](): void {
		this[lazyCursorSymbol].free();
		this.context.withCursors.delete(this);
		this[forgetAnchorSymbol](this[anchorSymbol]);
		this.context.withAnchors.delete(this);
	}

	public [prepareForEditSymbol](): void {
		this[lazyCursorSymbol].clear();
		this.context.withCursors.delete(this);
	}

	public [isFreedSymbol](): boolean {
		return this[lazyCursorSymbol].state === ITreeSubscriptionCursorState.Freed;
	}

	public get [cursorSymbol](): ITreeSubscriptionCursor {
		if (this[lazyCursorSymbol].state !== ITreeSubscriptionCursorState.Current) {
			assert(
				this[lazyCursorSymbol].state === ITreeSubscriptionCursorState.Cleared,
				0x778 /* Unset cursor should be in cleared state */,
			);
			assert(
				this[anchorSymbol] !== undefined,
				0x779 /* EditableTree should have an anchor if it does not have a cursor */,
			);
			const result = this[tryMoveCursorToAnchorSymbol](
				this[anchorSymbol],
				this[lazyCursorSymbol],
			);
			assert(
				result === TreeNavigationResult.Ok,
				0x77a /* It is invalid to access an EditableTree node which no longer exists */,
			);
			this.context.withCursors.add(this);
		}
		return this[lazyCursorSymbol];
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

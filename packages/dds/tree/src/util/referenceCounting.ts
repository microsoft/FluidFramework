/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

/**
 * An object which counts the number of users / references to it.
 * @remarks
 * This implements the [Reference counting](https://en.wikipedia.org/wiki/Reference_counting) pattern.
 * Getting the reference count correct is difficult in TypeScript and create care must be used.
 * Because of this, this interface should not be used in the public API.
 */
export interface ReferenceCounted {
	/**
	 * Called to increase the reference count tracked by this object.
	 * @remarks
	 * When a user of this object allows something else to use it,
	 * this should be called.
	 */
	referenceAdded(): void;
	/**
	 * Called to decrease the reference count tracked by this object.
	 * @remarks
	 * When a user of this object will no longer use, this should be called.
	 */
	referenceRemoved(): void;

	/**
	 * @returns true if mutating this object may impact other users of it.
	 *
	 * Implementations can return true if the refcount is 1 OR the content is logically immutable.
	 */
	isShared(): boolean;
}

/**
 * Base class to assist with implementing ReferenceCounted.
 */
export abstract class ReferenceCountedBase implements ReferenceCounted {
	protected constructor(private refCount: number = 1) {}

	public referenceAdded(count = 1): void {
		this.refCount += count;
	}

	public referenceRemoved(count = 1): void {
		this.refCount -= count;
		assert(this.refCount >= 0, 0x4c4 /* Negative ref count */);
		if (this.refCount === 0) {
			this.onUnreferenced();
		}
	}

	public isShared(): boolean {
		return this.refCount > 1;
	}

	public isUnreferenced(): boolean {
		return this.refCount === 0;
	}

	/**
	 * Called when refcount reaches 0.
	 */
	protected abstract onUnreferenced(): void;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

export interface ReferenceCounted {
	referenceAdded(): void;

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

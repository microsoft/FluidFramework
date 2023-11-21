/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const create = Symbol("Create IterableTreeListContent");

/**
 * Used to insert iterable content into a {@link (TreeListNode:interface)}.
 * @alpha
 */
export class IterableTreeListContent<T> implements Iterable<T> {
	private constructor(private readonly content: Iterable<T>) {}
	public static [create]<T>(content: Iterable<T>): IterableTreeListContent<T> {
		return new IterableTreeListContent(content);
	}
	public [Symbol.iterator](): Iterator<T> {
		return this.content[Symbol.iterator]();
	}
}

/**
 * Create an instance of an {@link IterableTreeListContent};
 */
export function createIterableTreeListContent<T>(content: Iterable<T>): IterableTreeListContent<T> {
	return IterableTreeListContent[create](content);
}

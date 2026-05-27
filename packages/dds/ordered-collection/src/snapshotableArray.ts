/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, DoublyLinkedList } from "@fluidframework/core-utils/internal";

export class SnapshotableArray<T> {
	protected data: DoublyLinkedList<T> = new DoublyLinkedList<T>();

	public asArray(): T[] {
		const result: T[] = [];
		for (const node of this.data) {
			result.push(node.data);
		}
		return result;
	}

	public async loadFrom(from: T[]): Promise<void> {
		assert(this.data.length === 0, 0x06b /* "Loading snapshot into a non-empty collection" */);
		for (const value of from) {
			this.data.push(value);
		}
	}

	public size(): number {
		return this.data.length;
	}
}

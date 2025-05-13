/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

export class SnapshotableArray<T> extends Array {
	protected data: T[] = [];

	public asArray(): T[] {
		return this.data;
	}

	public async loadFrom(from: T[]): Promise<void> {
		assert(this.data.length === 0, 0x06b /* "Loading snapshot into a non-empty collection" */);
		this.data = from;
	}

	public size(): number {
		return this.data.length;
	}
}

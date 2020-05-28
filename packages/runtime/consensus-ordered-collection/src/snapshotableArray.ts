/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";

export class SnapshotableArray<T> extends Array {
    protected data: T[] = [];

    public asArray() {
        return this.data;
    }

    public async loadFrom(from: T[]): Promise<void> {
        assert(this.data.length === 0, "Loading snapshot into a non-empty collection");
        this.data = from;
    }

    public size(): number {
        return this.data.length;
    }
}

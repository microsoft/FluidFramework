/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export class Multimap<K, V> extends Map<K, V[]> {
    add(key: K, value: V): void {
        this.get(key).push(value);
    }

    get(key: K): V[] {
        if (!this.has(key)) {
            this.set(key, []);
        }

        return super.get(key) as V[];
    }
}

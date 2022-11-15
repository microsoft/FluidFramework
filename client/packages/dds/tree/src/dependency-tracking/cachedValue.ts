/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ObservingDependent } from "./incrementalObservation";
import { SimpleObservingDependent } from "./simpleObservingDependent";

/**
 * A basic {@link ObservingDependent} implementation.
 *
 * Does not support caching results which are "undefined": Will always be recomputed.
 *
 * Currently does not implement Dependee so other values can't depend on it,
 * nor support the Cleanable protocol or any eviction system other than invalidation.
 */
class CachedValue<T> extends SimpleObservingDependent implements ICachedValue<T> {
    private cache?: T;
    public constructor(
        private readonly compute: (observer: ObservingDependent) => T,
        computationName: string,
    ) {
        super(() => {
            this.cache = undefined;
        }, computationName);
    }

    get(): T {
        this.cache ??= this.compute(this);
        return this.cache;
    }
}

/**
 * Caches and invalidates a value.
 */
export interface ICachedValue<T> {
    get(): T;
}

/**
 * Create a ICachedValue that is invalidated when `observer` (as provided to `compute`) gets invalidated.
 */
export function cachedValue<T>(
    compute: (observer: ObservingDependent) => T,
    computationName = "CachedValue",
): ICachedValue<T> {
    return new CachedValue(compute, computationName);
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import Random from "random-js";

/**
 * Returns a random-js `Random` instance, optionally seeded to make it deterministic.
 * @param seed - Optional seed to make the randomness source deterministic.
 * If not provided, this leverages Math.random() as an engine which is *not* deterministic.
 */
export function makeRandom(seed?: number | number[]): Random {
    if (seed === undefined) {
        return new Random();
    }

    const engine = Random.engines.mt19937();
    if (typeof seed === "number") {
        engine.seed(seed);
    } else {
        engine.seedWithArray(seed);
    }

    return new Random(engine);
}

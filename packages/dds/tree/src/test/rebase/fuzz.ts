/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { ChangeRebaser } from "../../rebase";

/**
 *
 * @param rebaser - `ChangeRebaser` instance used to combine generated changes
 * @param changeGenerator - Random change generator function
 * @param seed - Seed used to randomly generate and combine the changes
 * @param maxCombinations - Maximum number of changes to combine in order to produce the final change. Must be >= 0.
 * @returns A random change resulting from the combination of several random changes.
 */
 export function generateFuzzyCombinedChange<TChange>(
    rebaser: ChangeRebaser<TChange>,
    changeGenerator: (seed: number) => TChange,
    seed: number,
    maxCombinations: number): TChange {
    const rebase = rebaser.rebase.bind(rebaser);
    const compose = rebaser.compose.bind(rebaser);
    const invert = rebaser.invert.bind(rebaser);

    let change = changeGenerator(seed);
    const changes = [change];

    const operations = ["rebase", "invert", "compose"];

    for (let i = 1; i < (seed % maxCombinations); i++) {
        const random = makeRandom(seed + i).integer(1, 10000000);
        const operation = operations[random % operations.length];
        if (operation === "rebase") {
            change = rebase(changeGenerator(random), change);
        }
        if (operation === "compose") {
            change = compose([change, changeGenerator(random)]);
        }
        if (operation === "invert") {
            // get a random previous change to invert
            const inverseChange = invert(changes[random % changes.length]);
            change = compose([change, inverseChange]);
        }
        changes.push(change);
    }
    return change;
}

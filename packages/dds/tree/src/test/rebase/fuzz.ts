/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { ChangeRebaser } from "../../rebase";

/**
 *
 * @param rebaser - ChangeRebaser instance to apply the operations
 * @param changeGenerator - random change generator function
 * @param seed - random seed used to generate the changes
 * @param maxOps - maximum number of changes you would like to combine.
 * @returns changeset after all of the operations have been applied.
 */
 export function generateFuzzyCombinedChange<TChange>(
    rebaser: ChangeRebaser<TChange>,
    changeGenerator: (seed: number) => TChange,
    seed: number,
    maxOps: number): TChange {
    const rebase = rebaser.rebase.bind(rebaser);
    const compose = rebaser.compose.bind(rebaser);
    const invert = rebaser.invert.bind(rebaser);

    let change = changeGenerator(seed);
    const changes = [change];

    const operations = ["rebase", "invert", "compose"];

    for (let i = 1; i < (seed % maxOps); i++) {
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

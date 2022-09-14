/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { unreachableCase } from "@fluidframework/common-utils";
import { ChangeRebaser } from "../../rebase";

enum Operation {
    Rebase = 0,
    Compose = 1,
    Invert = 2,
}

/**
 *
 * @param rebaser - `ChangeRebaser` instance used to combine generated changes
 * @param changeGenerator - Random change generator function
 * @param seed - Seed used to randomly generate and combine the changes
 * @param maxCombinations - Maximum number of changes to combine in order
 * to produce the final change. Must be greater or equal to 0.
 * @returns A random change resulting from the combination of several random changes.
 */
 export function generateFuzzyCombinedChange<TChange>(
    rebaser: ChangeRebaser<TChange>,
    changeGenerator: (seed: number) => TChange,
    seed: number,
    maxCombinations: number): TChange {
    const random = makeRandom(seed);
    const rebase = rebaser.rebase.bind(rebaser);
    const compose = rebaser.compose.bind(rebaser);
    const invert = rebaser.invert.bind(rebaser);

    let change = changeGenerator(seed);

    // Rules for combining changes:
    // - We must not combine a change with itself
    // - We must not rebase a change over itself
    // - We must not rebase a change over its inverse
    // - We can only combine a change with its inverse if the inverse comes after the original
    // - We can only combine a change with its inverse if it hasn't already been combined with its inverse
    for (let i = random.integer(0, maxCombinations); i > 0; --i) {
        const operation = random.integer(Operation.Rebase, Operation.Invert) as Operation;
        switch (operation) {
            case Operation.Rebase:
                change = rebase(change, changeGenerator(random.real()));
                break;
            case Operation.Compose:
                change = compose([change, changeGenerator(random.real())]);
                break;
            case Operation.Invert:
                change = invert(change);
                break;
            default: unreachableCase(operation);
        }
    }
    return change;
}

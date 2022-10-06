/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Jsonable } from "@fluidframework/datastore-definitions";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { Transposed as T, toDelta, sequenceChangeRebaser } from "../../feature-libraries";
import { TreeSchemaIdentifier } from "../../schema-stored";
import { noFailure, OutputType, verifyChangeRebaser } from "../../rebase";
import { Delta, FieldKey } from "../../tree";
import { brand } from "../../util";
// TODO: Move ../rebase/fuzz.ts code outside of src/test
// eslint-disable-next-line import/no-internal-modules
import { generateFuzzyCombinedChange } from "../rebase/fuzz";
import { generateRandomChange, generateRandomUpPath } from "./randomSequenceGenerator";
import { asForest } from "./cases";

const random = makeRandom(4521357);

const fooKey = brand<FieldKey>("foo");
const keySet = new Set([fooKey]);
const pathGen = (seed: number) => generateRandomUpPath(keySet, seed, 1, 3);

const generateChange = (seed: number) => generateRandomChange(seed, pathGen);

const batchCount = 20;
const batchSize = 5;

// These tests are skipped because the SequenceChangeRebaser is not yet ready for this level of testing.
describe.skip("SequenceChangeRebaser - Fuzz", () => {
    describe("Simple changes", () => {
        for (let i = 0; i < batchCount; i++) {
            const seed = random.integer(1, 1000000);
            it(`seed: ${seed}`, () => {
                const innerRandom = makeRandom(seed);
                const changes = new Set<T.LocalChangeset>();
                for (let j = 0; j < batchSize; j++) {
                    const change = generateRandomChange(innerRandom.integer(1, 1000000), pathGen);
                    changes.add(change);
                }
                const output = verifyChangeRebaser(sequenceChangeRebaser, changes, isEquivalent);
                expectKnownFailures(output);
            });
        }
    });

    describe("Combined changes", () => {
        for (let i = 0; i < batchCount; i++) {
            const seed = random.integer(1, 1000000);
            it(`seed: ${seed}`, () => {
                const innerRandom = makeRandom(seed);
                const changes = new Set<T.LocalChangeset>();
                for (let j = 0; j < batchSize; j++) {
                    try {
                        const change = generateFuzzyCombinedChange(
                            sequenceChangeRebaser,
                            generateChange,
                            innerRandom.integer(1, 1000000),
                            5,
                        );
                        changes.add(change);
                    } catch (error) {
                        assert(error instanceof Error && error.message === "Not implemented");
                    }
                }
                const output = verifyChangeRebaser(sequenceChangeRebaser, changes, isEquivalent);
                expectKnownFailures(output);
            });
        }
    });

    it("Known issue", () => {
        const type: TreeSchemaIdentifier = brand("Node");
        const insertChange = asForest([
            2,
            {
                type: "Insert",
                id: 0,
                content: [
                    { type, value: 42 },
                    { type, value: 43 },
                ],
            },
        ]);
        const deleteChange = asForest([1, { type: "Delete", id: 0, count: 2 }]);
        const changes = new Set<T.LocalChangeset>([insertChange, deleteChange]);
        const output = verifyChangeRebaser(sequenceChangeRebaser, changes, isEquivalent);
        assert.deepEqual(output, noFailure);
    });
});

function expectKnownFailures(output: OutputType<T.LocalChangeset>) {
    for (const result of Object.values(output)) {
        for (const failure of result) {
            assert(failure.error instanceof Error && failure.error.message === "Not implemented");
        }
    }
}

function isEquivalent(a: T.LocalChangeset, b: T.LocalChangeset): boolean {
    const changeA = deltaToJSON(toDelta(a));
    const changeB = deltaToJSON(toDelta(b));
    return changeA === changeB;
}

const deltaToJSON = (delta: Delta.Root): string =>
    JSON.stringify(
        delta,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        (key, value): Jsonable => (value instanceof Map ? Array.from(value.entries()) : value),
    );

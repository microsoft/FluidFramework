import { strict as assert } from "assert";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { toDelta, Transposed as T } from "../../changeset";
import { sequenceChangeRebaser } from "../../feature-libraries";
import { verifyChangeRebaser } from "../../rebase";
import { FieldKey } from "../../tree";
import { brand } from "../../util";
import { generateFuzzyCombinedChange } from "../rebase/fuzz";
import { generateRandomChange, generateRandomUpPath } from "./randomSequenceGenerator";

const random = makeRandom(4521357);

const fooKey = brand<FieldKey>("foo");
const keySet = new Set([fooKey]);
const pathGen = (seed: number) => generateRandomUpPath(keySet, seed, 3, 5);

describe("testing the SequenceChangeRebaser", () => {
    it("using generateRandomChange function", async () => {
        for (let i = 0; i < 100; i++) {
            const changes = new Set<T.LocalChangeset>();
            for (let j = 0; j < 3; j++) {
                const change = generateRandomChange(
                    random.integer(1, 1000000),
                    pathGen,
                );
                changes.add(change);
            }
            const output = verifyChangeRebaser(
                sequenceChangeRebaser,
                changes,
                isEquivalent,
            );
            assert.equal(output.rebaseLeftDistributivity, "Passed");
            assert.equal(output.composeAssociativity, "Passed");
            assert.equal(output.rebaseRightDistributivity, "Passed");
            assert.equal(output.rebaseOverDoUndoPairIsNoOp, "Passed");
            assert.equal(output.rebaseOverUndoRedoPairIsNoOp, "Passed");
            assert.equal(output.composeWithInverseIsNoOp, "Passed");
            assert.equal(output.composeWithEmptyIsNoOp, "Passed");
            assert.equal(output.rebaseOverEmptyIsNoOp, "Passed");
            assert.equal(output.rebaseEmptyIsEmpty, "Passed");
            assert.equal(output.emptyInverseIsEmpty, "Passed");
        }
    });
});

const generateChange = (seed: number) => generateRandomChange(seed, pathGen);
describe("SequenceChangeRebaser - Fuzz", () => {
    it("using fuzz function", () => {
        for (let i = 0; i < 100; i++) {
            const changes = new Set<T.LocalChangeset>();
            for (let j = 0; j < 3; j++) {
                const change = generateFuzzyCombinedChange(
                    sequenceChangeRebaser,
                    generateChange,
                    random.integer(1, 1000000),
                    5,
                );
                changes.add(change);
            }
            const output = verifyChangeRebaser(
                sequenceChangeRebaser,
                changes,
                isEquivalent,
            );
            assert.equal(output.rebaseLeftDistributivity, "Passed");
            assert.equal(output.composeAssociativity, "Passed");
            assert.equal(output.rebaseRightDistributivity, "Passed");
            assert.equal(output.rebaseOverDoUndoPairIsNoOp, "Passed");
            assert.equal(output.rebaseOverUndoRedoPairIsNoOp, "Passed");
            assert.equal(output.composeWithInverseIsNoOp, "Passed");
            assert.equal(output.composeWithEmptyIsNoOp, "Passed");
            assert.equal(output.rebaseOverEmptyIsNoOp, "Passed");
            assert.equal(output.rebaseEmptyIsEmpty, "Passed");
            assert.equal(output.emptyInverseIsEmpty, "Passed");
        }
    });
});

function isEquivalent(a: T.LocalChangeset, b: T.LocalChangeset): boolean {
    const changeA = JSON.stringify(toDelta(a));
    const changeB = JSON.stringify(toDelta(b));
    return changeA === changeB;
}

import { strict as assert } from "assert";
import * as fs from "fs";
import { toDelta, Transposed as T } from "../../changeset";
import { sequenceChangeRebaser } from "../../feature-libraries";
import { verifyChangeRebaser } from "../../rebase";
import { FieldKey } from "../../tree";
import { brand } from "../../util";
import { generateFuzzyCombinedChange } from "../rebase/fuzz";
import { generateRandomChange, generateRandomUpPath } from "./randomSequenceGenerator";

const fooKey = brand<FieldKey>("foo");
const keySet = new Set([fooKey]);

const pathGen = (seed: number) => generateRandomUpPath(keySet, seed, 3, 5);
describe("testing the SequenceChangeRebaser", () => {
    it("using generateRandomChange function", async () => {
        const changes = new Set<T.LocalChangeset>();
        for (let i = 0; i <= 15; i++) {
            const change = generateRandomChange(Math.floor(Math.random() * 100), pathGen);
            changes.add(change);
        }
        const output = verifyChangeRebaser(
            sequenceChangeRebaser,
            changes,
            isEquivalent,
            "randomChangeImplementationErrors.json",
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

        fs.writeFile("generateRandomChangeErrors.json", JSON.stringify(output), (err: any) => {
            if (err) {
                console.log(err);
            }
        });
    });
});

const generateChange = (seed: number) => generateRandomChange(seed, pathGen);
describe("testing the SequenceChangeRebaser.", () => {
    it("using fuzz function", () => {
        const changes = new Set<T.LocalChangeset>();
        for (let i = 0; i <= 15; i++) {
            const change = generateFuzzyCombinedChange(
                sequenceChangeRebaser,
                generateChange,
                Math.floor(Math.random() * 100),
                5,
            );
            changes.add(change);
        }
        const output = verifyChangeRebaser(
            sequenceChangeRebaser,
            changes,
            isEquivalent,
            "fuzzyChangeImplementationErrors.json",
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

        fs.writeFile("generateFuzzyChangeErrors.json", JSON.stringify(output), (err: any) => {
            if (err) {
                console.log(err);
            }
        });
    });
});

function isEquivalent(a: T.LocalChangeset, b: T.LocalChangeset): boolean {
    const changeA = JSON.stringify(toDelta(a));
    const changeB = JSON.stringify(toDelta(b));
    return changeA === changeB;
}

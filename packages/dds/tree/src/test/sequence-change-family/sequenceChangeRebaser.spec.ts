/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { isAttachGroup, Transposed as T } from "../../changeset";
import {
    DUMMY_INVERT_TAG,
    sequenceChangeFamily,
    sequenceChangeRebaser,
    SequenceChangeset,
} from "../../feature-libraries";
import { TreeSchemaIdentifier } from "../../schema-stored";
import { Delta } from "../../tree";
import { brand } from "../../util";
import { deepFreeze } from "../utils";

const type: TreeSchemaIdentifier = brand("Node");

const testMarks: [string, T.Mark][] = [
    ["SetValue", { type: "Modify", value: { id: 0, value: 42 } }],
    ["MInsert", [{ type: "MInsert", id: 0, content: { type, value: 42 } }]],
    ["Insert-1x2", [{ type: "Insert", id: 0, content: [{ type, value: 42 }, { type, value: 43 }] }]],
    ["Insert-2x1", [
        { type: "Insert", id: 0, content: [{ type, value: 42 }] },
        { type: "Insert", id: 1, content: [{ type, value: 43 }] },
    ]],
    ["Delete", { type: "Delete", id: 0, count: 2 }],
    ["Revive", { type: "Revive", id: 0, count: 2, tomb: DUMMY_INVERT_TAG }],
];
deepFreeze(testMarks);

function asForest(markList: T.MarkList): SequenceChangeset {
    return {
        marks: { root: markList },
    };
}

describe("SequenceChangeFamily", () => {
    /**
     * This test simulates rebasing over an do-undo pair.
     */
    describe("A ↷ [B, B⁻¹] === A", () => {
        for (const [name1, mark1] of testMarks) {
            for (const [name2, mark2] of testMarks) {
                if (name2 === "Delete" && !isAttachGroup(mark1)) {
                    it.skip(`${name1} ↷ [${name2}, ${name2}⁻¹] => ${name1}`, () => {
                        /**
                         * These cases are currently disabled because:
                         * - Marks that affect existing content are removed instead of muted
                         *   when rebased over the deletion of that content.
                         */
                    });
                } else {
                    it(`${name1} ↷ [${name2}, ${name2}⁻¹] => ${name1}`, () => {
                        const change1 = asForest([mark1]);
                        const change2 = asForest([mark2]);
                        const inv = sequenceChangeRebaser.invert(change2);
                        const r1 = sequenceChangeRebaser.rebase(change1, change2);
                        const r2 = sequenceChangeRebaser.rebase(r1, inv);
                        assert.deepEqual(r2, change1);
                    });
                }
            }
        }
    });

    /**
     * This test simulates sandwich rebasing:
     * a change is first rebased over the inverse of a change it took for granted
     * then rebased over the updated version of that change (the same as the original in our case).
     *
     * The first rebase (A ↷ B) is purely for the purpose of manufacturing a change to which we can
     * apply the inverse of some change.
     */
    describe("(A ↷ B) ↷ [B⁻¹, B] === A ↷ B", () => {
        for (const [name1, mark1] of testMarks) {
            for (const [name2, mark2] of testMarks) {
                it(`${name1} ↷ [${name2}, ${name2}⁻¹, ${name2}] => ${name1} ↷ ${name2}`, () => {
                    const change1 = asForest([mark1]);
                    const change2 = asForest([mark2]);
                    const inverse2 = sequenceChangeRebaser.invert(change2);
                    const r1 = sequenceChangeRebaser.rebase(change1, change2);
                    const r2 = sequenceChangeRebaser.rebase(r1, inverse2);
                    const r3 = sequenceChangeRebaser.rebase(r2, change2);
                    assert.deepEqual(r3, r1);
                });
            }
        }
    });

    describe("A ○ A⁻¹ === ε", () => {
        for (const [name, mark] of testMarks) {
            if (name === "SetValue" || name === "Delete") {
                it.skip(`${name} ○ ${name}⁻¹ === ε`, () => {
                    /**
                     * These cases are currently disabled because the inverses of SetValue Delete
                     * do not capture which prior change they are reverting.
                     */
                });
            } else {
                it(`${name} ○ ${name}⁻¹ === ε`, () => {
                    const change = asForest([mark]);
                    const inv = sequenceChangeRebaser.invert(change);
                    const actual = sequenceChangeRebaser.compose([change, inv]);
                    const delta = sequenceChangeFamily.intoDelta(actual);
                    assert.deepEqual(delta, Delta.empty);
                });
            }
        }
    });
});

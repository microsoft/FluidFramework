/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Transposed as T } from "../../changeset";
import {
    sequenceChangeFamily,
    sequenceChangeRebaser,
    SequenceChangeset,
} from "../../feature-libraries";
import { TreeSchemaIdentifier } from "../../schema-stored";
import { Delta } from "../../tree";
import { brand } from "../../util";
import { deepFreeze } from "../utils";

const type: TreeSchemaIdentifier = brand("Node");
const tomb = "Dummy Changeset Tag";

const testMarks: [string, T.Mark][] = [
    ["SetValue", { type: "Modify", value: { id: 0, value: 42 } }],
    ["MInsert", { type: "MInsert", id: 0, content: { type, value: 42 }, value: { id: 0, value: 43 } }],
    ["Insert", { type: "Insert", id: 0, content: [{ type, value: 42 }, { type, value: 43 }] }],
    ["Delete", { type: "Delete", id: 0, count: 2 }],
    ["Revive", { type: "Revive", id: 0, count: 2, tomb }],
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
                if (name2 === "Delete") {
                    it.skip(`${name1} ↷ [${name2}, ${name2}⁻¹] => ${name1}`, () => {
                        /**
                         * These cases are currently disabled because:
                         * - Marks that affect existing content are removed instead of muted
                         *   when rebased over the deletion of that content. This prevents us
                         *   from then reinstating the mark when rebasing over the revive.
                         * - Tombs are not added when rebasing an insert over a gap that is
                         *   immediately left of deleted content. This prevents us from being able to
                         *   accurately track the position of the insert.
                         */
                    });
                } else {
                    it(`${name1} ↷ [${name2}, ${name2}⁻¹] => ${name1}`, () => {
                        for (let offset1 = 1; offset1 <= 4; ++offset1) {
                            for (let offset2 = 1; offset2 <= 4; ++offset2) {
                                const change1 = asForest([offset1, mark1]);
                                const change2 = asForest([offset2, mark2]);
                                const inv = sequenceChangeRebaser.invert(change2);
                                const r1 = sequenceChangeRebaser.rebase(change1, change2);
                                const r2 = sequenceChangeRebaser.rebase(r1, inv);
                                assert.deepEqual(r2, change1);
                            }
                        }
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
                    for (let offset1 = 1; offset1 <= 4; ++offset1) {
                        for (let offset2 = 1; offset2 <= 4; ++offset2) {
                            const change1 = asForest([offset1, mark1]);
                            const change2 = asForest([offset2, mark2]);
                            const inverse2 = sequenceChangeRebaser.invert(change2);
                            const r1 = sequenceChangeRebaser.rebase(change1, change2);
                            const r2 = sequenceChangeRebaser.rebase(r1, inverse2);
                            const r3 = sequenceChangeRebaser.rebase(r2, change2);
                            assert.deepEqual(r3, r1);
                        }
                    }
                });
            }
        }
    });

    describe("A ○ A⁻¹ === ε", () => {
        for (const [name, mark] of testMarks) {
            if (name === "SetValue" || name === "Delete") {
                it.skip(`${name} ○ ${name}⁻¹ === ε`, () => {
                    /**
                     * These cases are currently disabled because the inverses of SetValue and Delete
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

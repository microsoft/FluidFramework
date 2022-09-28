/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SequenceField as SF } from "../../../feature-libraries";
import { TreeSchemaIdentifier } from "../../../schema-stored";
import { brand } from "../../../util";
import { TestChange } from "../../testChange";
import { deepFreeze } from "../../utils";

const type: TreeSchemaIdentifier = brand("Node");
const tomb = "Dummy Changeset Tag";

const testMarks: [string, SF.Mark<TestChange>][] = [
    ["SetValue", { type: "Modify", changes: TestChange.mint([], 1) }],
    ["MInsert", { type: "MInsert", id: 0, content: { type, value: 42 }, changes: TestChange.mint([], 2) }],
    ["Insert", { type: "Insert", id: 0, content: [{ type, value: 42 }, { type, value: 43 }] }],
    ["Delete", { type: "Delete", id: 0, count: 2 }],
    ["Revive", { type: "Revive", id: 0, count: 2, tomb }],
];
deepFreeze(testMarks);

describe("SequenceField - Rebaser Axioms", () => {
    /**
     * This test simulates rebasing over an do-undo pair.
     */
    describe("A ↷ [B, B⁻¹] === A", () => {
        for (const [name1, mark1] of testMarks) {
            for (const [name2, mark2] of testMarks) {
                if (name2 === "Delete") {
                    it.skip(`(${name1} ↷ ${name2}) ↷ ${name2}⁻¹ => ${name1}`, () => {
                        /**
                         * These cases are currently disabled because:
                         * - Marks that affect existing content are removed instead of muted
                         * when rebased over the deletion of that content. This prevents us
                         * from then reinstating the mark when rebasing over the revive.
                         * - Tombs are not added when rebasing an insert over a gap that is
                         * immediately left of deleted content. This prevents us from being able to
                         * accurately track the position of the insert.
                         */
                    });
                } else {
                    it(`(${name1} ↷ ${name2}) ↷ ${name2}⁻¹ => ${name1}`, () => {
                        for (let offset1 = 1; offset1 <= 4; ++offset1) {
                            for (let offset2 = 1; offset2 <= 4; ++offset2) {
                                const change1 = [offset1, mark1];
                                const change2 = [offset2, mark2];
                                const inv = SF.invert(change2, TestChange.invert);
                                const r1 = SF.rebase(change1, change2, TestChange.rebase);
                                const r2 = SF.rebase(r1, inv, TestChange.rebase);
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
                            const change1 = [offset1, mark1];
                            const change2 = [offset2, mark2];
                            const inverse2 = SF.invert(change2, TestChange.invert);
                            const r1 = SF.rebase(change1, change2, TestChange.rebase);
                            const r2 = SF.rebase(r1, inverse2, TestChange.rebase);
                            const r3 = SF.rebase(r2, change2, TestChange.rebase);
                            assert.deepEqual(r3, r1);
                        }
                    }
                });
            }
        }
    });

    describe("A ○ A⁻¹ === ε", () => {
        for (const [name, mark] of testMarks) {
            if (name === "Delete") {
                it.skip(`${name} ○ ${name}⁻¹ === ε`, () => {
                    /**
                     * These cases are currently disabled because the inverse of Delete
                     * does not capture which node it is reviving.
                     */
                });
            } else {
                it(`${name} ○ ${name}⁻¹ === ε`, () => {
                    const change = [mark];
                    const inv = SF.invert(change, TestChange.invert);
                    const actual = SF.compose([change, inv], TestChange.compose);
                    const delta = SF.sequenceFieldToDelta(actual, TestChange.toDelta);
                    assert.deepEqual(delta, []);
                });
            }
        }
    });
});

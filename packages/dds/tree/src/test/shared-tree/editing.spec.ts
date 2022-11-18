/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { singleTextCursor } from "../../feature-libraries";
import { jsonString, singleJsonCursor } from "../../domains";
import { rootFieldKeySymbol } from "../../tree";
import { TransactionResult } from "../../checkout";
import { JsonCompatible } from "../../util";
import { Sequencer, TestTree, TestTreeEdit } from "./testTree";

describe("Editing", () => {
    describe("Sequence Field", () => {
        it("can rebase dependent inserts", async () => {
            const sequencer = new Sequencer();
            const tree1 = new TestTree({ state: singleJsonCursor("y") });
            const tree2 = tree1.fork();

            const x = insert(tree1, 0, "x");

            const ac = insert(tree2, 1, "a", "c");
            const b = insert(tree2, 2, "b");

            const sequenced = sequencer.order([x, ac, b]);
            tree1.receive(sequenced);
            tree2.receive(sequenced);

            expectJsonTree([tree1, tree2], ["x", "y", "a", "b", "c"]);
        });
    });
});

/**
 * Helper function to insert node at a given index.
 *
 * @param tree - The tree on which to perform the insert.
 * @param index - The index in the root field at which to insert.
 * @param value - The value of the inserted node.
 */
function insert(tree: TestTree, index: number, ...values: string[]): TestTreeEdit {
    return tree.runTransaction((forest, editor) => {
        const field = editor.sequenceField(undefined, rootFieldKeySymbol);
        const nodes = values.map((value) => singleTextCursor({ type: jsonString.name, value }));
        field.insert(index, nodes);
        return TransactionResult.Apply;
    });
}

function expectJsonTree(actual: TestTree | TestTree[], expected: JsonCompatible[]): void {
    const trees = Array.isArray(actual) ? actual : [actual];
    for (const tree of trees) {
        const roots = tree.jsonRoots();
        assert.deepEqual(roots, expected);
    }
}

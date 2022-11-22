/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { singleTextCursor } from "../../feature-libraries";
import { jsonString } from "../../domains";
import { rootFieldKeySymbol } from "../../tree";
import { JsonCompatible } from "../../util";
import { Sequencer, TestTree, TestTreeEdit } from "./testTree";

describe("Editing", () => {
    describe("Sequence Field", () => {
        it("can rebase local dependent inserts", async () => {
            const sequencer = new Sequencer();
            const tree1 = TestTree.fromJson("y");
            const tree2 = tree1.fork();

            const x = insert(tree1, 0, "x");

            const ac = insert(tree2, 1, "a", "c");
            const b = insert(tree2, 2, "b");

            const sequenced = sequencer.order([x, ac, b]);
            tree1.receive(sequenced);
            tree2.receive(sequenced);

            expectJsonTree([tree1, tree2], ["x", "y", "a", "b", "c"]);
        });

        it("can rebase a local delete", async () => {
            const sequencer = new Sequencer();
            const tree1 = TestTree.fromJson(["x", "y"]);
            const tree2 = tree1.fork();

            const delY = tree1.runTransaction((forest, editor) => {
                const field = editor.sequenceField(undefined, rootFieldKeySymbol);
                field.delete(1, 1);
            });

            const addW = insert(tree2, 0, "w");

            const sequenced = sequencer.order([addW, delY]);
            tree1.receive(sequenced);
            tree2.receive(sequenced);

            expectJsonTree([tree1, tree2], ["w", "x"]);
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
    });
}

function expectJsonTree(actual: TestTree | TestTree[], expected: JsonCompatible[]): void {
    const trees = Array.isArray(actual) ? actual : [actual];
    for (const tree of trees) {
        const roots = tree.jsonRoots();
        assert.deepEqual(roots, expected);
    }
}

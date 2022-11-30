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
        it("can rebase local dependent inserts", () => {
            const sequencer = new Sequencer();
            const tree1 = TestTree.fromJson("y");
            const tree2 = tree1.fork();

            const x = insert(tree1, 0, "x");

            const ac = insert(tree2, 1, "a", "c");
            const b = insert(tree2, 2, "b");

            const sequenced = sequencer.sequence([x, ac, b]);
            tree1.receive(sequenced);
            tree2.receive(sequenced);

            expectJsonTree([tree1, tree2], ["x", "y", "a", "b", "c"]);
        });

        it("can rebase a local delete", () => {
            const sequencer = new Sequencer();
            const tree1 = TestTree.fromJson(["x", "y"]);
            const tree2 = tree1.fork();

            const delY = tree1.runTransaction((forest, editor) => {
                const field = editor.sequenceField(undefined, rootFieldKeySymbol);
                field.delete(1, 1);
            });

            const addW = insert(tree2, 0, "w");

            const sequenced = sequencer.sequence([addW, delY]);
            tree1.receive(sequenced);
            tree2.receive(sequenced);

            expectJsonTree([tree1, tree2], ["w", "x"]);
        });

        // TODO: investigate. It seems PR13079 may have broken this.
        it.skip("does not interleave concurrent left to right inserts", () => {
            const sequencer = new Sequencer();
            const tree1 = TestTree.fromJson([]);
            const tree2 = tree1.fork();
            const tree3 = tree1.fork();
            const tree4 = tree1.fork();

            const a = insert(tree1, 0, "a");
            const b = insert(tree1, 1, "b");
            const c = insert(tree1, 2, "c");

            const r = insert(tree2, 0, "r");
            const s = insert(tree2, 1, "s");
            const t = insert(tree2, 2, "t");

            const x = insert(tree3, 0, "x");
            const y = insert(tree3, 1, "y");
            const z = insert(tree3, 2, "z");

            const sequenced = sequencer.sequence([x, r, a, s, b, y, c, z, t]);
            tree1.receive(sequenced);
            tree2.receive(sequenced);
            tree3.receive(sequenced);
            tree4.receive(sequenced);

            expectJsonTree(
                [tree1, tree2, tree3, tree4],
                ["a", "b", "c", "r", "s", "t", "x", "y", "z"],
            );
        });

        // The current implementation orders the letters from inserted last to inserted first.
        // TODO: address this scenario.
        it.skip("does not interleave concurrent right to left inserts", () => {
            const sequencer = new Sequencer();
            const tree1 = TestTree.fromJson([]);
            const tree2 = tree1.fork();
            const tree3 = tree1.fork();
            const tree4 = tree1.fork();

            const c = insert(tree1, 0, "c");
            const b = insert(tree1, 0, "b");
            const a = insert(tree1, 0, "a");

            const t = insert(tree2, 0, "t");
            const s = insert(tree2, 0, "s");
            const r = insert(tree2, 0, "r");

            const z = insert(tree3, 0, "z");
            const y = insert(tree3, 0, "y");
            const x = insert(tree3, 0, "x");

            const sequenced = sequencer.sequence([z, t, c, s, b, y, a, x, r]);
            tree1.receive(sequenced);
            tree2.receive(sequenced);
            tree3.receive(sequenced);
            tree4.receive(sequenced);

            expectJsonTree(
                [tree1, tree2, tree3, tree4],
                ["a", "b", "c", "r", "s", "t", "x", "y", "z"],
            );
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

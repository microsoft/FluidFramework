/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { FieldKinds, NodeChangeset } from "../../feature-libraries";
import { TreeSchemaIdentifier } from "../../schema-stored";
import { Delta } from "../../tree";
import { brand, JsonCompatibleReadOnly } from "../../util";

const invalidChildHandler = (_: NodeChangeset) => assert.fail("Should not be called");

describe("Value field changesets", () => {
    const nodeType: TreeSchemaIdentifier = brand("Node");
    const fieldHandler = FieldKinds.value.changeHandler;
    const tree1 = { type: nodeType, value: "value1" };
    const tree2 = { type: nodeType, value: "value2" };
    const change1 = (fieldHandler.editor as FieldKinds.ValueFieldEditor).setValue(tree1);
    const change2 = (fieldHandler.editor as FieldKinds.ValueFieldEditor).setValue(tree2);

    it("can be composed", () => {
        const invalidChildComposer = (_: NodeChangeset[]) => assert.fail("Should not be called");

        const composed = fieldHandler.rebaser.compose(
            [change1, change2],
            invalidChildComposer,
        );

        assert.deepEqual(composed, change2);
    });

    it("can be composed with child changes", () => {
        const nodeChange: NodeChangeset = { valueChange: { value: 1 } };
        const childChange = fieldHandler.editor.buildChildChange(0, nodeChange);
        const change1WithChildChange = fieldHandler.rebaser.compose(
            [change1, childChange],
            (changes) => changes[0],
        );

        const expected = {
            value: tree1,
            changes: nodeChange,
        };

        assert.deepEqual(change1WithChildChange, expected);
        assert.deepEqual(
            fieldHandler.rebaser.compose(
                [childChange, change1],
                (changes) => changes[0],
            ),
            change1,
        );
    });

    it("can be rebased", () => {
        const invalidChildRebaser = (_1: NodeChangeset, _2: NodeChangeset) => assert.fail("Should not be called");

        const rebased = fieldHandler.rebaser.rebase(
            change2,
            change1,
            invalidChildRebaser,
        );
        assert.deepEqual(rebased, change2);
    });

    it("can be represented as a delta", () => {
        const expected = [
            { type: Delta.MarkType.Delete, count: 1 },
            { type: Delta.MarkType.Insert, content: [tree1] },
        ];

        const delta = fieldHandler.intoDelta(change1, invalidChildHandler);
        assert.deepEqual(delta, expected);
    });

    it("can be encoded in JSON", () => {
        const version = 0;
        const encoded = JSON.stringify(fieldHandler.encoder.encodeForJson(version, change1, invalidChildHandler));
        const invalidChildDecoder = (_: JsonCompatibleReadOnly) => assert.fail("Should not be called");
        const decoded = fieldHandler.encoder.decodeJson(version, JSON.parse(encoded), invalidChildDecoder);
        assert.deepEqual(decoded, change1);
    });
});

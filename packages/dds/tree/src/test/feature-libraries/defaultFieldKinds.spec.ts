/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    FieldChangeHandler,
    FieldKinds,
    NodeChangeset,
    singleTextCursor,
    singleTextCursorNew,
} from "../../feature-libraries";
import { TreeSchemaIdentifier } from "../../schema-stored";
import { Delta } from "../../tree";
import { brand, JsonCompatibleReadOnly } from "../../util";
import { assertMarkListEqual } from "../utils";

const nodeType: TreeSchemaIdentifier = brand("Node");
const tree1 = { type: nodeType, value: "value1" };
const tree2 = { type: nodeType, value: "value2" };
const tree3 = { type: nodeType, value: "value3" };
const nodeChange1: NodeChangeset = { valueChange: { value: "value3" } };
const nodeChange2: NodeChangeset = { valueChange: { value: "value4" } };
const nodeChange3: NodeChangeset = { valueChange: { value: "value5" } };

const deltaFromChild1 = (child: NodeChangeset): Delta.Modify => {
    assert.deepEqual(child, nodeChange1);
    return { type: Delta.MarkType.Modify, setValue: "value3" };
};

const deltaFromChild2 = (child: NodeChangeset): Delta.Modify => {
    assert.deepEqual(child, nodeChange2);
    return { type: Delta.MarkType.Modify, setValue: "value4" };
};

const encodedChild = "encoded child";

const childEncoder1 = (change: NodeChangeset) => {
    assert.deepEqual(change, nodeChange1);
    return encodedChild;
};

const childDecoder1 = (encodedChange: JsonCompatibleReadOnly) => {
    assert.equal(encodedChange, encodedChild);
    return nodeChange1;
};

const childComposer1_2 = (changes: NodeChangeset[]): NodeChangeset => {
    assert(changes.length === 2);
    assert.deepEqual(changes, [nodeChange1, nodeChange2]);
    return nodeChange3;
};

describe("Value field changesets", () => {
    const fieldHandler: FieldChangeHandler<FieldKinds.ValueChangeset> =
        FieldKinds.value.changeHandler;

    const change1WithChildChange: FieldKinds.ValueChangeset = {
        value: tree1,
        changes: nodeChange1,
    };
    const childChange1: FieldKinds.ValueChangeset = { changes: nodeChange1 };
    const childChange2: FieldKinds.ValueChangeset = { changes: nodeChange2 };
    const childChange3: FieldKinds.ValueChangeset = { changes: nodeChange3 };

    const change1 = (fieldHandler.editor as FieldKinds.ValueFieldEditor).set(
        singleTextCursor(tree1),
    );
    const change2 = (fieldHandler.editor as FieldKinds.ValueFieldEditor).set(
        singleTextCursor(tree2),
    );

    const simpleChildComposer = (changes: NodeChangeset[]) => {
        assert.equal(changes.length, 1);
        return changes[0];
    };

    it("can be composed", () => {
        const composed = fieldHandler.rebaser.compose([change1, change2], simpleChildComposer);

        assert.deepEqual(composed, change2);
    });

    it("can be composed with child changes", () => {
        assert.deepEqual(
            fieldHandler.rebaser.compose([change1, childChange1], simpleChildComposer),
            change1WithChildChange,
        );

        const expected: FieldKinds.ValueChangeset = {
            value: tree1,
            changes: nodeChange1,
        };

        assert.deepEqual(change1WithChildChange, expected);
        assert.deepEqual(
            fieldHandler.rebaser.compose([childChange1, change1], simpleChildComposer),
            change1,
        );

        assert.deepEqual(
            fieldHandler.rebaser.compose([childChange1, childChange2], childComposer1_2),
            childChange3,
        );
    });

    it("can invert children", () => {
        const childInverter = (child: NodeChangeset): NodeChangeset => {
            assert.deepEqual(child, nodeChange1);
            return nodeChange2;
        };

        const inverted = fieldHandler.rebaser.invert(change1WithChildChange, childInverter);

        assert.deepEqual(inverted.changes, nodeChange2);
    });

    it("can be rebased", () => {
        const childRebaser = (_1: NodeChangeset, _2: NodeChangeset) =>
            assert.fail("Should not be called");

        assert.deepEqual(
            fieldHandler.rebaser.rebase(change2, change1WithChildChange, childRebaser),
            change2,
        );
    });

    it("can rebase child changes", () => {
        const childRebaser = (change: NodeChangeset, base: NodeChangeset) => {
            assert.deepEqual(change, nodeChange2);
            assert.deepEqual(base, nodeChange1);
            return nodeChange3;
        };

        const baseChange = fieldHandler.editor.buildChildChange(0, nodeChange1);
        const changeToRebase = fieldHandler.editor.buildChildChange(0, nodeChange2);

        assert.deepEqual(
            fieldHandler.rebaser.rebase(changeToRebase, baseChange, childRebaser),
            childChange3,
        );
    });

    it("can be represented as a delta", () => {
        const expected: Delta.MarkList = [
            { type: Delta.MarkType.Delete, count: 1 },
            { type: Delta.MarkType.Insert, content: [singleTextCursorNew(tree3)] },
        ];

        const delta = fieldHandler.intoDelta(change1WithChildChange, deltaFromChild1);
        assertMarkListEqual(delta, expected);
    });

    it("can be encoded in JSON", () => {
        const version = 0;

        const encoded = JSON.stringify(
            fieldHandler.encoder.encodeForJson(version, change1WithChildChange, childEncoder1),
        );

        const decoded = fieldHandler.encoder.decodeJson(
            version,
            JSON.parse(encoded),
            childDecoder1,
        );
        assert.deepEqual(decoded, change1WithChildChange);
    });
});

describe("Optional field changesets", () => {
    const fieldHandler: FieldChangeHandler<FieldKinds.OptionalChangeset> =
        FieldKinds.optional.changeHandler;
    const editor: FieldKinds.OptionalFieldEditor =
        fieldHandler.editor as FieldKinds.OptionalFieldEditor;

    const change1: FieldKinds.OptionalChangeset = {
        fieldChange: { newContent: tree1, wasEmpty: true },
        childChange: nodeChange1,
    };

    const change2: FieldKinds.OptionalChangeset = editor.set(singleTextCursor(tree2), false);
    const change3: FieldKinds.OptionalChangeset = editor.set(singleTextCursor(tree2), true);
    const change4: FieldKinds.OptionalChangeset = editor.buildChildChange(0, nodeChange2);

    it("can be composed", () => {
        const childComposer = (_: NodeChangeset[]) => assert.fail("Should not be called");
        const composed = fieldHandler.rebaser.compose([change1, change2], childComposer);
        assert.deepEqual(composed, change3);
    });

    it("can compose child changes", () => {
        const expected: FieldKinds.OptionalChangeset = {
            fieldChange: change1.fieldChange,
            childChange: nodeChange3,
        };

        assert.deepEqual(
            fieldHandler.rebaser.compose([change1, change4], childComposer1_2),
            expected,
        );
    });

    it("can be inverted", () => {
        const childInverter = (change: NodeChangeset) => {
            assert.deepEqual(change, nodeChange1);
            return nodeChange2;
        };

        const expected: FieldKinds.OptionalChangeset = {
            fieldChange: { wasEmpty: false },
            childChange: nodeChange2,
        };

        assert.deepEqual(fieldHandler.rebaser.invert(change1, childInverter), expected);
    });

    it("can be rebased", () => {
        const childRebaser = (_change: NodeChangeset, _base: NodeChangeset) =>
            assert.fail("Should not be called");
        assert.deepEqual(fieldHandler.rebaser.rebase(change3, change1, childRebaser), change2);
    });

    it("can rebase child change", () => {
        const baseChange: FieldKinds.OptionalChangeset = { childChange: nodeChange1 };
        const changeToRebase: FieldKinds.OptionalChangeset = { childChange: nodeChange2 };

        const childRebaser = (change: NodeChangeset, base: NodeChangeset) => {
            assert.deepEqual(change, nodeChange2);
            assert.deepEqual(base, nodeChange1);
            return nodeChange3;
        };

        const expected: FieldKinds.OptionalChangeset = { childChange: nodeChange3 };

        assert.deepEqual(
            fieldHandler.rebaser.rebase(changeToRebase, baseChange, childRebaser),
            expected,
        );
    });

    it("can be converted to a delta when field was empty", () => {
        const expected: Delta.MarkList = [
            {
                type: Delta.MarkType.Insert,
                content: [singleTextCursorNew(tree3)],
            },
        ];

        assertMarkListEqual(fieldHandler.intoDelta(change1, deltaFromChild1), expected);
    });

    it("can be converted to a delta when replacing content", () => {
        const expected: Delta.MarkList = [
            { type: Delta.MarkType.Delete, count: 1 },
            { type: Delta.MarkType.Insert, content: [singleTextCursorNew(tree2)] },
        ];

        assertMarkListEqual(fieldHandler.intoDelta(change2, deltaFromChild1), expected);
    });

    it("can be converted to a delta with only child changes", () => {
        const expected: Delta.MarkList = [{ type: Delta.MarkType.Modify, setValue: "value4" }];

        assertMarkListEqual(fieldHandler.intoDelta(change4, deltaFromChild2), expected);
    });

    it("can be encoded in JSON", () => {
        const version = 0;

        const encoded = JSON.stringify(
            fieldHandler.encoder.encodeForJson(version, change1, childEncoder1),
        );

        const decoded = fieldHandler.encoder.decodeJson(
            version,
            JSON.parse(encoded),
            childDecoder1,
        );
        assert.deepEqual(decoded, change1);
    });
});

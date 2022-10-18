/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    FieldChangeHandler,
    FieldKind,
    Multiplicity,
    FieldKinds,
    NodeChangeset,
    GenericChangeset,
    genericFieldKind,
} from "../../../feature-libraries";
import { Delta, FieldKey } from "../../../tree";
import { brand, fail, JsonCompatibleReadOnly } from "../../../util";

type ValueChangeset = FieldKinds.ReplaceOp<number>;

const valueHandler: FieldChangeHandler<ValueChangeset> = {
    rebaser: FieldKinds.replaceRebaser(),
    encoder: new FieldKinds.ValueEncoder<ValueChangeset & JsonCompatibleReadOnly>(),
    editor: { buildChildChange: () => fail("Child changes not supported") },
    intoDelta: (change) =>
        change === 0 ? [] : [{ type: Delta.MarkType.Modify, setValue: change.new }],
};

const valueField = new FieldKind(
    brand("Value"),
    Multiplicity.Value,
    valueHandler,
    () => false,
    new Set(),
);

const fieldA: FieldKey = brand("a");

const valueChange0To1: ValueChangeset = { old: 0, new: 1 };
const valueChange1To0: ValueChangeset = { old: 1, new: 0 };
const valueChange1To2: ValueChangeset = { old: 1, new: 2 };
const valueChange2To1: ValueChangeset = { old: 2, new: 1 };
const valueChange0To2: ValueChangeset = { old: 0, new: 2 };

function nodeChangeFromValueChange(valueChange: ValueChangeset): NodeChangeset {
    return {
        fieldChanges: new Map([
            [
                fieldA,
                {
                    fieldKind: valueField.identifier,
                    change: brand(valueChange),
                },
            ],
        ]),
    };
}

function valueChangeFromNodeChange(nodeChange: NodeChangeset): ValueChangeset {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return nodeChange.fieldChanges!.get(fieldA)!.change as unknown as ValueChangeset;
}

const nodeChange0To1: NodeChangeset = nodeChangeFromValueChange(valueChange0To1);
const nodeChange1To0: NodeChangeset = nodeChangeFromValueChange(valueChange1To0);
const nodeChange1To2: NodeChangeset = nodeChangeFromValueChange(valueChange1To2);
const nodeChange2To1: NodeChangeset = nodeChangeFromValueChange(valueChange2To1);
const nodeChange0To2: NodeChangeset = nodeChangeFromValueChange(valueChange0To2);

const unexpectedDelegate = () => assert.fail("Unexpected call");

const childComposer = (nodeChanges: NodeChangeset[]): NodeChangeset => {
    const valueChanges = nodeChanges.map(valueChangeFromNodeChange);
    const valueChange = valueHandler.rebaser.compose(valueChanges, unexpectedDelegate);
    return nodeChangeFromValueChange(valueChange);
};

const childInverter = (nodeChange: NodeChangeset): NodeChangeset => {
    const valueChange = valueChangeFromNodeChange(nodeChange);
    const inverse = valueHandler.rebaser.invert(valueChange, unexpectedDelegate);
    return nodeChangeFromValueChange(inverse);
};

const childRebaser = (nodeChangeA: NodeChangeset, nodeChangeB: NodeChangeset): NodeChangeset => {
    const valueChangeA = valueChangeFromNodeChange(nodeChangeA);
    const valueChangeB = valueChangeFromNodeChange(nodeChangeB);
    const rebased = valueHandler.rebaser.rebase(valueChangeA, valueChangeB, unexpectedDelegate);
    return nodeChangeFromValueChange(rebased);
};

const childToDelta = (nodeChange: NodeChangeset): Delta.Modify => {
    const valueChange = valueChangeFromNodeChange(nodeChange);
    assert(typeof valueChange !== "number");
    const nodeDelta: Delta.Modify = {
        type: Delta.MarkType.Modify,
        setValue: valueChange.new,
    };
    return nodeDelta;
};

const childEncoder = (nodeChange: NodeChangeset): JsonCompatibleReadOnly => {
    const valueChange = valueChangeFromNodeChange(nodeChange);
    return valueHandler.encoder.encodeForJson(0, valueChange, unexpectedDelegate);
};

const childDecoder = (nodeChange: JsonCompatibleReadOnly): NodeChangeset => {
    const valueChange = valueHandler.encoder.decodeJson(0, nodeChange, unexpectedDelegate);
    return nodeChangeFromValueChange(valueChange);
};

describe("Generic FieldKind", () => {
    describe("compose", () => {
        it("empty list", () => {
            const actual = genericFieldKind.changeHandler.rebaser.compose([], childComposer);
            assert.deepEqual(actual, []);
        });

        it("Highest index on earlier change", () => {
            const changeA: GenericChangeset = [
                {
                    index: 0,
                    nodeChange: nodeChange0To1,
                },
                {
                    index: 2,
                    nodeChange: nodeChange0To1,
                },
            ];
            const changeB: GenericChangeset = [
                {
                    index: 0,
                    nodeChange: nodeChange1To2,
                },
                {
                    index: 1,
                    nodeChange: nodeChange1To2,
                },
            ];
            const expected: GenericChangeset = [
                {
                    index: 0,
                    nodeChange: nodeChange0To2,
                },
                {
                    index: 1,
                    nodeChange: nodeChange1To2,
                },
                {
                    index: 2,
                    nodeChange: nodeChange0To1,
                },
            ];
            const actual = genericFieldKind.changeHandler.rebaser.compose(
                [changeA, changeB],
                childComposer,
            );
            assert.deepEqual(actual, expected);
        });

        it("Highest index on later change", () => {
            const changeA: GenericChangeset = [
                {
                    index: 0,
                    nodeChange: nodeChange0To1,
                },
                {
                    index: 1,
                    nodeChange: nodeChange0To1,
                },
            ];
            const changeB: GenericChangeset = [
                {
                    index: 0,
                    nodeChange: nodeChange1To2,
                },
                {
                    index: 2,
                    nodeChange: nodeChange1To2,
                },
            ];
            const expected: GenericChangeset = [
                {
                    index: 0,
                    nodeChange: nodeChange0To2,
                },
                {
                    index: 1,
                    nodeChange: nodeChange0To1,
                },
                {
                    index: 2,
                    nodeChange: nodeChange1To2,
                },
            ];
            const actual = genericFieldKind.changeHandler.rebaser.compose(
                [changeA, changeB],
                childComposer,
            );
            assert.deepEqual(actual, expected);
        });
    });

    describe("rebase", () => {
        it("Highest index on earlier change", () => {
            const changeA: GenericChangeset = [
                {
                    index: 0,
                    nodeChange: nodeChange0To2,
                },
                {
                    index: 2,
                    nodeChange: nodeChange1To2,
                },
            ];
            const changeB: GenericChangeset = [
                {
                    index: 0,
                    nodeChange: nodeChange0To1,
                },
                {
                    index: 1,
                    nodeChange: nodeChange0To1,
                },
            ];
            const expected: GenericChangeset = [
                {
                    index: 0,
                    nodeChange: nodeChange1To2,
                },
                {
                    index: 2,
                    nodeChange: nodeChange1To2,
                },
            ];
            const actual = genericFieldKind.changeHandler.rebaser.rebase(
                changeA,
                changeB,
                childRebaser,
            );
            assert.deepEqual(actual, expected);
        });

        it("Highest index on later change", () => {
            const changeA: GenericChangeset = [
                {
                    index: 0,
                    nodeChange: nodeChange0To2,
                },
                {
                    index: 1,
                    nodeChange: nodeChange1To2,
                },
            ];
            const changeB: GenericChangeset = [
                {
                    index: 0,
                    nodeChange: nodeChange0To1,
                },
                {
                    index: 2,
                    nodeChange: nodeChange0To1,
                },
            ];
            const expected: GenericChangeset = [
                {
                    index: 0,
                    nodeChange: nodeChange1To2,
                },
                {
                    index: 1,
                    nodeChange: nodeChange1To2,
                },
            ];
            const actual = genericFieldKind.changeHandler.rebaser.rebase(
                changeA,
                changeB,
                childRebaser,
            );
            assert.deepEqual(actual, expected);
        });
    });

    it("invert", () => {
        const forward: GenericChangeset = [
            {
                index: 0,
                nodeChange: nodeChange0To1,
            },
            {
                index: 1,
                nodeChange: nodeChange1To2,
            },
        ];
        const expected: GenericChangeset = [
            {
                index: 0,
                nodeChange: nodeChange1To0,
            },
            {
                index: 1,
                nodeChange: nodeChange2To1,
            },
        ];
        const actual = genericFieldKind.changeHandler.rebaser.invert(forward, childInverter);
        assert.deepEqual(actual, expected);
    });

    it("intoDelta", () => {
        const input: GenericChangeset = [
            {
                index: 0,
                nodeChange: nodeChange0To1,
            },
            {
                index: 2,
                nodeChange: nodeChange1To2,
            },
        ];

        const valueDelta1: Delta.Mark = {
            type: Delta.MarkType.Modify,
            setValue: 1,
        };

        const valueDelta2: Delta.Mark = {
            type: Delta.MarkType.Modify,
            setValue: 2,
        };

        const expected: Delta.MarkList = [valueDelta1, 1, valueDelta2];

        const actual = genericFieldKind.changeHandler.intoDelta(input, childToDelta);
        assert.deepEqual(actual, expected);
    });

    it("Json encoding", () => {
        const input: GenericChangeset = [
            {
                index: 0,
                nodeChange: nodeChange0To1,
            },
            {
                index: 2,
                nodeChange: nodeChange1To2,
            },
        ];
        const version = 0;
        const encoded = JSON.stringify(
            genericFieldKind.changeHandler.encoder.encodeForJson(version, input, childEncoder),
        );
        const decoded = genericFieldKind.changeHandler.encoder.decodeJson(
            version,
            JSON.parse(encoded),
            childDecoder,
        );
        assert.deepEqual(decoded, input);
    });

    it("build child change", () => {
        const change0 = genericFieldKind.changeHandler.editor.buildChildChange(0, nodeChange0To1);
        const change1 = genericFieldKind.changeHandler.editor.buildChildChange(1, nodeChange0To1);
        const change2 = genericFieldKind.changeHandler.editor.buildChildChange(2, nodeChange0To1);
        assert.deepEqual(change0, [{ index: 0, nodeChange: nodeChange0To1 }]);
        assert.deepEqual(change1, [{ index: 1, nodeChange: nodeChange0To1 }]);
        assert.deepEqual(change2, [{ index: 2, nodeChange: nodeChange0To1 }]);
    });
});

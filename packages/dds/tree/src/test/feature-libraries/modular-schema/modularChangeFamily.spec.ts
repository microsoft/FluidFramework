/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { RepairDataStore } from "../../../core";
import {
    FieldChangeEncoder,
    FieldChangeHandler,
    FieldChangeMap,
    FieldChangeRebaser,
    FieldKind,
    Multiplicity,
    ModularChangeFamily,
    FieldKinds,
    FieldEditor,
    NodeChangeset,
    genericFieldKind,
} from "../../../feature-libraries";
import { makeAnonChange, RevisionTag } from "../../../rebase";
import { FieldKindIdentifier } from "../../../schema-stored";
import { AnchorSet, Delta, FieldKey, UpPath } from "../../../tree";
import { brand, fail, JsonCompatibleReadOnly } from "../../../util";
import { assertDeltaEqual } from "../../utils";

type ValueChangeset = FieldKinds.ReplaceOp<number>;

const valueHandler: FieldChangeHandler<ValueChangeset> = {
    rebaser: FieldKinds.replaceRebaser(),
    encoder: new FieldKinds.ValueEncoder<ValueChangeset & JsonCompatibleReadOnly>(),
    editor: { buildChildChange: (index, change) => fail("Child changes not supported") },

    intoDelta: (change, deltaFromChild) =>
        change === 0 ? [] : [{ type: Delta.MarkType.Modify, setValue: change.new }],
};

const valueField = new FieldKind(
    brand("Value"),
    Multiplicity.Value,
    valueHandler,
    (a, b) => false,
    new Set(),
);

const singleNodeEncoder: FieldChangeEncoder<NodeChangeset> = {
    encodeForJson: (formatVersion, change, encodeChild) => encodeChild(change),
    decodeJson: (formatVersion, change, decodeChild) => decodeChild(change),
};

const singleNodeRebaser: FieldChangeRebaser<NodeChangeset> = {
    compose: (changes, composeChild) => composeChild(changes),
    invert: (change, invertChild) => invertChild(change.change),
    rebase: (change, base, rebaseChild) => rebaseChild(change, base.change),
};

const singleNodeEditor: FieldEditor<NodeChangeset> = {
    buildChildChange: (index: number, change: NodeChangeset): NodeChangeset => {
        assert(index === 0, "This field kind only supports one node in its field");
        return change;
    },
};

const singleNodeHandler: FieldChangeHandler<NodeChangeset> = {
    rebaser: singleNodeRebaser,
    encoder: singleNodeEncoder,
    editor: singleNodeEditor,
    intoDelta: (change, deltaFromChild) => [deltaFromChild(change, 0)],
};

const singleNodeField = new FieldKind(
    brand("SingleNode"),
    Multiplicity.Value,
    singleNodeHandler,
    (a, b) => false,
    new Set(),
);

const noRepair: RepairDataStore = {
    capture: () => {},
    getNodes: () => assert.fail(),
    getValue: () => assert.fail(),
};

const fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind> = new Map(
    [singleNodeField, valueField].map((field) => [field.identifier, field]),
);

const family = new ModularChangeFamily(fieldKinds);

const fieldA: FieldKey = brand("a");
const fieldB: FieldKey = brand("b");

const valueChange1a: ValueChangeset = { old: 0, new: 1 };
const valueChange1b: ValueChangeset = { old: 0, new: 2 };
const valueChange2: ValueChangeset = { old: 1, new: 2 };

const nodeChange1a: NodeChangeset = {
    fieldChanges: new Map([
        [fieldA, { fieldKind: valueField.identifier, change: brand(valueChange1a) }],
    ]),
};

const nodeChanges1b: NodeChangeset = {
    fieldChanges: new Map([
        [
            fieldA,
            {
                fieldKind: valueField.identifier,
                change: brand(valueChange1b),
            },
        ],
        [
            fieldB,
            {
                fieldKind: valueField.identifier,
                change: brand(valueChange1a),
            },
        ],
    ]),
};

const nodeChanges2: NodeChangeset = {
    fieldChanges: new Map([
        [
            fieldA,
            {
                fieldKind: valueField.identifier,
                change: brand(valueChange2),
            },
        ],
        [
            fieldB,
            {
                fieldKind: valueField.identifier,
                change: brand(valueChange1a),
            },
        ],
    ]),
};

const rootChange1a: FieldChangeMap = new Map([
    [
        fieldA,
        {
            fieldKind: singleNodeField.identifier,
            change: brand(nodeChange1a),
        },
    ],
    [
        fieldB,
        {
            fieldKind: valueField.identifier,
            change: brand(valueChange2),
        },
    ],
]);

const rootChange1aGeneric: FieldChangeMap = new Map([
    [
        fieldA,
        {
            fieldKind: genericFieldKind.identifier,
            change: brand(genericFieldKind.changeHandler.editor.buildChildChange(0, nodeChange1a)),
        },
    ],
    [
        fieldB,
        {
            fieldKind: valueField.identifier,
            change: brand(valueChange2),
        },
    ],
]);

const rootChange1b: FieldChangeMap = new Map([
    [
        fieldA,
        {
            fieldKind: singleNodeField.identifier,
            change: brand(nodeChanges1b),
        },
    ],
]);

const rootChange1bGeneric: FieldChangeMap = new Map([
    [
        fieldA,
        {
            fieldKind: genericFieldKind.identifier,
            change: brand(genericFieldKind.changeHandler.editor.buildChildChange(0, nodeChanges1b)),
        },
    ],
]);

const rootChange2: FieldChangeMap = new Map([
    [
        fieldA,
        {
            fieldKind: singleNodeField.identifier,
            change: brand(nodeChanges2),
        },
    ],
]);

const rootChange2Generic: FieldChangeMap = new Map([
    [
        fieldA,
        {
            fieldKind: genericFieldKind.identifier,
            change: brand(genericFieldKind.changeHandler.editor.buildChildChange(0, nodeChanges2)),
        },
    ],
]);

const testValue = "Test Value";
const nodeValueOverwrite: FieldChangeMap = new Map([
    [
        fieldA,
        {
            fieldKind: genericFieldKind.identifier,
            change: brand(
                genericFieldKind.changeHandler.editor.buildChildChange(0, {
                    valueChange: { value: testValue },
                }),
            ),
        },
    ],
]);

const detachedBy: RevisionTag = brand(42);
const nodeValueRevert: FieldChangeMap = new Map([
    [
        fieldA,
        {
            fieldKind: genericFieldKind.identifier,
            change: brand(
                genericFieldKind.changeHandler.editor.buildChildChange(0, {
                    valueChange: { revert: detachedBy },
                }),
            ),
        },
    ],
]);

describe("ModularChangeFamily", () => {
    describe("compose", () => {
        const composedValues: ValueChangeset = { old: 0, new: 2 };

        const composedNodeChange: NodeChangeset = {
            fieldChanges: new Map([
                [
                    fieldA,
                    {
                        fieldKind: valueField.identifier,
                        change: brand(composedValues),
                    },
                ],
                [
                    fieldB,
                    {
                        fieldKind: valueField.identifier,
                        change: brand(valueChange1a),
                    },
                ],
            ]),
        };

        it("compose specific ○ specific", () => {
            const expectedCompose: FieldChangeMap = new Map([
                [
                    fieldA,
                    {
                        fieldKind: singleNodeField.identifier,
                        change: brand(composedNodeChange),
                    },
                ],
                [
                    fieldB,
                    {
                        fieldKind: valueField.identifier,
                        change: brand(valueChange2),
                    },
                ],
            ]);
            assert.deepEqual(family.compose([rootChange1a, rootChange2]), expectedCompose);
        });

        it("compose specific ○ generic", () => {
            const expectedCompose: FieldChangeMap = new Map([
                [
                    fieldA,
                    {
                        fieldKind: singleNodeField.identifier,
                        change: brand(composedNodeChange),
                    },
                ],
                [
                    fieldB,
                    {
                        fieldKind: valueField.identifier,
                        change: brand(valueChange2),
                    },
                ],
            ]);
            assert.deepEqual(family.compose([rootChange1a, rootChange2Generic]), expectedCompose);
        });

        it("compose generic ○ specific", () => {
            const expectedCompose: FieldChangeMap = new Map([
                [
                    fieldA,
                    {
                        fieldKind: singleNodeField.identifier,
                        change: brand(composedNodeChange),
                    },
                ],
                [
                    fieldB,
                    {
                        fieldKind: valueField.identifier,
                        change: brand(valueChange2),
                    },
                ],
            ]);
            assert.deepEqual(family.compose([rootChange1aGeneric, rootChange2]), expectedCompose);
        });

        it("compose generic ○ generic", () => {
            const expectedCompose: FieldChangeMap = new Map([
                [
                    fieldA,
                    {
                        fieldKind: genericFieldKind.identifier,
                        change: brand(
                            genericFieldKind.changeHandler.editor.buildChildChange(
                                0,
                                composedNodeChange,
                            ),
                        ),
                    },
                ],
                [
                    fieldB,
                    {
                        fieldKind: valueField.identifier,
                        change: brand(valueChange2),
                    },
                ],
            ]);
            assert.deepEqual(
                family.compose([rootChange1aGeneric, rootChange2Generic]),
                expectedCompose,
            );
        });
    });

    describe("invert", () => {
        const valueInverse1: ValueChangeset = { old: 1, new: 0 };
        const valueInverse2: ValueChangeset = { old: 2, new: 1 };

        const nodeInverse: NodeChangeset = {
            fieldChanges: new Map([
                [
                    fieldA,
                    {
                        fieldKind: valueField.identifier,
                        change: brand(valueInverse1),
                    },
                ],
            ]),
        };

        it("specific", () => {
            const expectedInverse: FieldChangeMap = new Map([
                [fieldA, { fieldKind: singleNodeField.identifier, change: brand(nodeInverse) }],
                [fieldB, { fieldKind: valueField.identifier, change: brand(valueInverse2) }],
            ]);

            assert.deepEqual(family.invert(makeAnonChange(rootChange1a)), expectedInverse);
        });

        it("generic", () => {
            const fieldChange = genericFieldKind.changeHandler.editor.buildChildChange(
                0,
                nodeInverse,
            );
            const expectedInverse: FieldChangeMap = new Map([
                [fieldA, { fieldKind: genericFieldKind.identifier, change: brand(fieldChange) }],
                [fieldB, { fieldKind: valueField.identifier, change: brand(valueInverse2) }],
            ]);

            assert.deepEqual(family.invert(makeAnonChange(rootChange1aGeneric)), expectedInverse);
        });
    });

    describe("rebase", () => {
        it("rebase specific ↷ specific", () => {
            assert.deepEqual(
                family.rebase(rootChange1b, makeAnonChange(rootChange1a)),
                rootChange2,
            );
        });

        it("rebase specific ↷ generic", () => {
            assert.deepEqual(
                family.rebase(rootChange1b, makeAnonChange(rootChange1aGeneric)),
                rootChange2,
            );
        });

        it("rebase generic ↷ specific", () => {
            assert.deepEqual(
                family.rebase(rootChange1bGeneric, makeAnonChange(rootChange1a)),
                rootChange2,
            );
        });

        it("rebase generic ↷ generic", () => {
            assert.deepEqual(
                family.rebase(rootChange1bGeneric, makeAnonChange(rootChange1aGeneric)),
                rootChange2Generic,
            );
        });
    });

    describe("intoDelta", () => {
        it("fieldChanges", () => {
            const valueDelta1: Delta.MarkList = [
                {
                    type: Delta.MarkType.Modify,
                    setValue: 1,
                },
            ];

            const valueDelta2: Delta.MarkList = [
                {
                    type: Delta.MarkType.Modify,
                    setValue: 2,
                },
            ];

            const nodeDelta: Delta.MarkList = [
                {
                    type: Delta.MarkType.Modify,
                    fields: new Map([[fieldA, valueDelta1]]),
                },
            ];

            const expectedDelta: Delta.Root = new Map([
                [fieldA, nodeDelta],
                [fieldB, valueDelta2],
            ]);

            assertDeltaEqual(family.intoDelta(rootChange1a), expectedDelta);
        });

        it("value overwrite", () => {
            const nodeDelta: Delta.MarkList = [
                {
                    type: Delta.MarkType.Modify,
                    setValue: testValue,
                },
            ];
            const expectedDelta: Delta.Root = new Map([[fieldA, nodeDelta]]);
            assertDeltaEqual(family.intoDelta(nodeValueOverwrite), expectedDelta);
        });

        it("value revert", () => {
            const nodeDelta: Delta.MarkList = [
                {
                    type: Delta.MarkType.Modify,
                    setValue: testValue,
                },
            ];
            const expectedDelta: Delta.Root = new Map([[fieldA, nodeDelta]]);
            const repair: RepairDataStore = {
                capture: (TreeDestruction) => assert.fail(),
                getNodes: () => assert.fail(),
                getValue: (revision, path) => {
                    assert.equal(revision, detachedBy);
                    assert.deepEqual(path, {
                        parent: undefined,
                        parentField: fieldA,
                        parentIndex: 0,
                    });
                    return testValue;
                },
            };
            const actual = family.intoDelta(nodeValueRevert, repair);
            assertDeltaEqual(actual, expectedDelta);
        });
    });

    it("Json encoding", () => {
        const version = 0;
        const encoded = JSON.stringify(family.encoder.encodeForJson(version, rootChange1a));
        const decoded = family.encoder.decodeJson(version, JSON.parse(encoded));
        assert.deepEqual(decoded, rootChange1a);
    });

    it("build child change", () => {
        const editor = family.buildEditor((edit) => {}, new AnchorSet());
        const path: UpPath = {
            parent: undefined,
            parentField: fieldA,
            parentIndex: 0,
        };

        editor.submitChange(path, fieldB, valueField.identifier, brand(valueChange1a));
        const changes = editor.getChanges();
        const nodeChange: NodeChangeset = {
            fieldChanges: new Map([
                [fieldB, { fieldKind: valueField.identifier, change: brand(valueChange1a) }],
            ]),
        };

        const fieldChange = genericFieldKind.changeHandler.editor.buildChildChange(0, nodeChange);
        const expectedChange: FieldChangeMap = new Map([
            [fieldA, { fieldKind: genericFieldKind.identifier, change: brand(fieldChange) }],
        ]);

        assert.deepEqual(changes, [expectedChange]);
    });

    it("build value change", () => {
        const editor = family.buildEditor((edit) => {}, new AnchorSet());
        const path: UpPath = {
            parent: undefined,
            parentField: fieldA,
            parentIndex: 0,
        };

        editor.setValue(path, testValue);
        const changes = editor.getChanges();
        assert.deepEqual(changes, [nodeValueOverwrite]);
    });
});

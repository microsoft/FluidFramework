/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
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
    UpPathWithFieldKinds,
} from "../../../feature-libraries";
import { FieldKindIdentifier } from "../../../schema-stored";
import { AnchorSet, Delta, FieldKey } from "../../../tree";
import { brand, fail, JsonCompatibleReadOnly } from "../../../util";

type ValueChangeset = FieldKinds.ReplaceOp<number>;

const valueHandler: FieldChangeHandler<ValueChangeset> = {
    rebaser: FieldKinds.replaceRebaser(),
    encoder: new FieldKinds.ValueEncoder<ValueChangeset & JsonCompatibleReadOnly>(),
    editor: { buildChildChange: (index, change) => fail("Child changes not supported") },

    intoDelta: (change, deltaFromChild) => change === 0
        ? []
        : [{ type: Delta.MarkType.Modify, setValue: change.new }],
};

const valueField = new FieldKind(
    brand("Value"),
    Multiplicity.Value,
    valueHandler,
    (a, b) => false,
    new Set(),
);

const singleNodeEncoder: FieldChangeEncoder<FieldChangeMap> = {
    encodeForJson: (formatVersion, change, encodeChild) => encodeChild(change),
    decodeJson: (formatVersion, change, decodeChild) => decodeChild(change),
};

const singleNodeRebaser: FieldChangeRebaser<FieldChangeMap> = {
    compose: (changes, composeChild) => composeChild(changes),
    invert: (change, invertChild) => invertChild(change),
    rebase: (change, base, rebaseChild) => rebaseChild(change, base),
};

const singleNodeEditor: FieldEditor<FieldChangeMap> = {
    buildChildChange: (index: number, change: FieldChangeMap) => {
        assert(index === 0, "This field kind only supports one node in its field");
        return change;
    },
};

const singleNodeHandler: FieldChangeHandler<FieldChangeMap> = {
    rebaser: singleNodeRebaser,
    encoder: singleNodeEncoder,
    editor: singleNodeEditor,

    intoDelta: (change, deltaFromChild) => [{
        type: Delta.MarkType.Modify,
        fields: deltaFromChild(change),
    }],
};

const singleNodeField = new FieldKind(
    brand("SingleNode"),
    Multiplicity.Value,
    singleNodeHandler,
    (a, b) => false,
    new Set(),
);

const fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind> = new Map(
    [singleNodeField, valueField].map((field) => [field.identifier, field]),
);

const family = new ModularChangeFamily(fieldKinds);

const fieldA: FieldKey = brand("a");
const fieldB: FieldKey = brand("b");

const valueChange1a: ValueChangeset = { old: 0, new: 1 };
const valueChange1b: ValueChangeset = { old: 0, new: 2 };
const valueChange2: ValueChangeset = { old: 1, new: 2 };

const innerChanges1a: FieldChangeMap = new Map([[
    fieldA,
    { fieldKind: valueField.identifier, change: brand(valueChange1a) },
]]);

const innerChanges1b: FieldChangeMap = new Map([
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
]);

const innerChanges2: FieldChangeMap = new Map([
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
]);

const rootChange1a: FieldChangeMap = new Map([
    [
        fieldA,
        {
            fieldKind: singleNodeField.identifier,
            change: brand(innerChanges1a),
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

const rootChange1b: FieldChangeMap = new Map([[
    fieldA,
    {
        fieldKind: singleNodeField.identifier,
        change: brand(innerChanges1b),
    },
]]);

const rootChange2: FieldChangeMap = new Map([[
    fieldA,
    {
        fieldKind: singleNodeField.identifier,
        change: brand(innerChanges2),
    },
]]);

describe("ModularChangeFamily", () => {
    it("compose", () => {
        const composedValues: ValueChangeset = { old: 0, new: 2 };

        const innerComposed: FieldChangeMap = new Map([
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
        ]);

        const expectedCompose: FieldChangeMap = new Map([
            [
                fieldA,
                {
                    fieldKind: singleNodeField.identifier,
                    change: brand(innerComposed),
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

    it("invert", () => {
        const valueInverse1: ValueChangeset = { old: 1, new: 0 };
        const valueInverse2: ValueChangeset = { old: 2, new: 1 };

        const innerInverse: FieldChangeMap = new Map([[
            fieldA,
            {
                fieldKind: valueField.identifier,
                change: brand(valueInverse1),
            },
        ]]);

        const expectedInverse: FieldChangeMap = new Map([
            [
                fieldA,
                { fieldKind: singleNodeField.identifier, change: brand(innerInverse) },
            ],
            [
                fieldB,
                { fieldKind: valueField.identifier, change: brand(valueInverse2) },
            ],
        ]);

        assert.deepEqual(family.invert(rootChange1a), expectedInverse);
    });

    it("rebase", () => {
        assert.deepEqual(family.rebase(rootChange1b, rootChange1a), rootChange2);
    });

    it("intoDelta", () => {
        const valueDelta1: Delta.MarkList = [{
            type: Delta.MarkType.Modify,
            setValue: 1,
        }];

        const valueDelta2: Delta.MarkList = [{
            type: Delta.MarkType.Modify,
            setValue: 2,
        }];

        const nodeDelta: Delta.MarkList = [{
            type: Delta.MarkType.Modify,
            fields: new Map([[fieldA, valueDelta1]]),
        }];

        const expectedDelta: Delta.Root = new Map([
            [fieldA, nodeDelta],
            [fieldB, valueDelta2],
        ]);

        assert.deepEqual(family.intoDelta(rootChange1a), expectedDelta);
    });

    it("Json encoding", () => {
        const version = 0;
        const encoded = JSON.stringify(family.encoder.encodeForJson(version, rootChange1a));
        const decoded = family.encoder.decodeJson(version, JSON.parse(encoded));
        assert.deepEqual(decoded, rootChange1a);
    });

    it("build child change", () => {
        const editor = family.buildEditor((delta) => {}, new AnchorSet());
        const path: UpPathWithFieldKinds = {
            parent: undefined,
            parentField: fieldA,
            parentFieldKind: singleNodeField.identifier,
            parentIndex: 0,
        };

        editor.submitChange(path, fieldB, valueField.identifier, brand(valueChange1a));
        const changes = editor.getChanges();
        const innerChange: FieldChangeMap = new Map([[
            fieldB,
            { fieldKind: valueField.identifier, change: brand(valueChange1a) },
        ]]);

        const expectedChange: FieldChangeMap = new Map([[
            fieldA,
            { fieldKind: singleNodeField.identifier, change: brand(innerChange) },
        ]]);

        assert.deepEqual(changes, [expectedChange]);
    });
});

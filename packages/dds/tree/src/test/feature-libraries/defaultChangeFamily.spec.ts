/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { jsonString } from "../../domains";
import { AnchorSet, Delta, FieldKey, ITreeCursorSynchronous, UpPath } from "../../tree";
import {
    defaultChangeFamily as family,
    DefaultEditBuilder,
    singleTextCursor,
    singleTextCursorNew,
} from "../../feature-libraries";
import { brand } from "../../util";
import { assertDeltaEqual } from "../utils";

const rootKey = brand<FieldKey>("root");
const fooKey = brand<FieldKey>("foo");

const root: UpPath = {
    parent: undefined,
    parentField: rootKey,
    parentIndex: 0,
};

const root_foo2: UpPath = {
    parent: root,
    parentField: fooKey,
    parentIndex: 2,
};

const root_foo2_foo5: UpPath = {
    parent: root_foo2,
    parentField: fooKey,
    parentIndex: 5,
};

const nodeX = { type: jsonString.name, value: "X" };
const nodeXCursor: ITreeCursorSynchronous = singleTextCursorNew(nodeX);

function assertDeltasEqual(actual: Delta.Root[], expected: Delta.Root[]): void {
    assert.equal(actual.length, expected.length);
    for (let i = 0; i < actual.length; ++i) {
        assertDeltaEqual(actual[i], expected[i]);
    }
}

describe("DefaultEditBuilder", () => {
    it("Does not produces deltas if no editing calls are made to it", () => {
        const deltas: Delta.Root[] = [];
        const _builder = new DefaultEditBuilder(family, deltas.push.bind(deltas), new AnchorSet());
        assertDeltasEqual(deltas, []);
    });

    it("Produces one delta for each editing call made to it", () => {
        const deltas: Delta.Root[] = [];
        const builder = new DefaultEditBuilder(family, deltas.push.bind(deltas), new AnchorSet());
        const expected: Delta.Root[] = [];

        builder.setValue(root, 42);
        expected.push(
            new Map([
                [
                    rootKey,
                    [
                        {
                            type: Delta.MarkType.Modify,
                            setValue: 42,
                        },
                    ],
                ],
            ]),
        );
        assertDeltasEqual(deltas, expected);

        builder.setValue(root, 43);
        expected.push(
            new Map([
                [
                    rootKey,
                    [
                        {
                            type: Delta.MarkType.Modify,
                            setValue: 43,
                        },
                    ],
                ],
            ]),
        );
        assertDeltasEqual(deltas, expected);

        builder.setValue(root, 44);
        expected.push(
            new Map([
                [
                    rootKey,
                    [
                        {
                            type: Delta.MarkType.Modify,
                            setValue: 44,
                        },
                    ],
                ],
            ]),
        );
        assertDeltasEqual(deltas, expected);
    });

    describe("Node Edits", () => {
        it("Can set the root node value", () => {
            const deltas: Delta.Root[] = [];
            const builder = new DefaultEditBuilder(
                family,
                deltas.push.bind(deltas),
                new AnchorSet(),
            );
            builder.setValue(root, 42);
            const expected: Delta.Root = new Map([
                [
                    rootKey,
                    [
                        {
                            type: Delta.MarkType.Modify,
                            setValue: 42,
                        },
                    ],
                ],
            ]);
            assertDeltasEqual(deltas, [expected]);
        });

        it("Can set a child node value", () => {
            const deltas: Delta.Root[] = [];
            const builder = new DefaultEditBuilder(
                family,
                deltas.push.bind(deltas),
                new AnchorSet(),
            );
            const expected: Delta.Root = new Map([
                [
                    rootKey,
                    [
                        {
                            type: Delta.MarkType.Modify,
                            fields: new Map([
                                [
                                    fooKey,
                                    [
                                        2,
                                        {
                                            type: Delta.MarkType.Modify,
                                            fields: new Map([
                                                [
                                                    fooKey,
                                                    [
                                                        5,
                                                        {
                                                            type: Delta.MarkType.Modify,
                                                            setValue: 42,
                                                        },
                                                    ],
                                                ],
                                            ]),
                                        },
                                    ],
                                ],
                            ]),
                        },
                    ],
                ],
            ]);
            builder.setValue(root_foo2_foo5, 42);
            assertDeltasEqual(deltas, [expected]);
        });
    });

    describe("Value Field Edits", () => {
        it("Can overwrite a populated root field", () => {
            const deltas: Delta.Root[] = [];
            const builder = new DefaultEditBuilder(
                family,
                deltas.push.bind(deltas),
                new AnchorSet(),
            );
            builder.valueField(undefined, rootKey).set(singleTextCursor(nodeX));
            const expected: Delta.Root = new Map([
                [
                    rootKey,
                    [
                        {
                            type: Delta.MarkType.Delete,
                            count: 1,
                        },
                        {
                            type: Delta.MarkType.Insert,
                            content: [nodeXCursor],
                        },
                    ],
                ],
            ]);
            assertDeltasEqual(deltas, [expected]);
        });

        it("Can overwrite a populated child field", () => {
            const deltas: Delta.Root[] = [];
            const builder = new DefaultEditBuilder(
                family,
                deltas.push.bind(deltas),
                new AnchorSet(),
            );
            const expected: Delta.Root = new Map([
                [
                    rootKey,
                    [
                        {
                            type: Delta.MarkType.Modify,
                            fields: new Map([
                                [
                                    fooKey,
                                    [
                                        2,
                                        {
                                            type: Delta.MarkType.Modify,
                                            fields: new Map([
                                                [
                                                    fooKey,
                                                    [
                                                        {
                                                            type: Delta.MarkType.Delete,
                                                            count: 1,
                                                        },
                                                        {
                                                            type: Delta.MarkType.Insert,
                                                            content: [nodeXCursor],
                                                        },
                                                    ],
                                                ],
                                            ]),
                                        },
                                    ],
                                ],
                            ]),
                        },
                    ],
                ],
            ]);
            builder.valueField(root_foo2, fooKey).set(singleTextCursor(nodeX));
            assertDeltasEqual(deltas, [expected]);
        });
    });

    describe("Optional Field Edits", () => {
        it("Can overwrite a populated root field", () => {
            const deltas: Delta.Root[] = [];
            const builder = new DefaultEditBuilder(
                family,
                deltas.push.bind(deltas),
                new AnchorSet(),
            );
            builder.optionalField(undefined, rootKey).set(singleTextCursor(nodeX), false);
            const expected: Delta.Root = new Map([
                [
                    rootKey,
                    [
                        {
                            type: Delta.MarkType.Delete,
                            count: 1,
                        },
                        {
                            type: Delta.MarkType.Insert,
                            content: [nodeXCursor],
                        },
                    ],
                ],
            ]);
            assertDeltasEqual(deltas, [expected]);
        });

        it("Can overwrite a populated child field", () => {
            const deltas: Delta.Root[] = [];
            const builder = new DefaultEditBuilder(
                family,
                deltas.push.bind(deltas),
                new AnchorSet(),
            );
            const expected: Delta.Root = new Map([
                [
                    rootKey,
                    [
                        {
                            type: Delta.MarkType.Modify,
                            fields: new Map([
                                [
                                    fooKey,
                                    [
                                        2,
                                        {
                                            type: Delta.MarkType.Modify,
                                            fields: new Map([
                                                [
                                                    fooKey,
                                                    [
                                                        {
                                                            type: Delta.MarkType.Delete,
                                                            count: 1,
                                                        },
                                                        {
                                                            type: Delta.MarkType.Insert,
                                                            content: [nodeXCursor],
                                                        },
                                                    ],
                                                ],
                                            ]),
                                        },
                                    ],
                                ],
                            ]),
                        },
                    ],
                ],
            ]);
            builder.optionalField(root_foo2, fooKey).set(singleTextCursor(nodeX), false);
            assertDeltasEqual(deltas, [expected]);
        });

        it("Can set an empty root field", () => {
            const deltas: Delta.Root[] = [];
            const builder = new DefaultEditBuilder(
                family,
                deltas.push.bind(deltas),
                new AnchorSet(),
            );
            builder.optionalField(undefined, rootKey).set(singleTextCursor(nodeX), true);
            const expected: Delta.Root = new Map([
                [
                    rootKey,
                    [
                        {
                            type: Delta.MarkType.Insert,
                            content: [nodeXCursor],
                        },
                    ],
                ],
            ]);
            assertDeltasEqual(deltas, [expected]);
        });

        it("Can set an empty child field", () => {
            const deltas: Delta.Root[] = [];
            const builder = new DefaultEditBuilder(
                family,
                deltas.push.bind(deltas),
                new AnchorSet(),
            );
            const expected: Delta.Root = new Map([
                [
                    rootKey,
                    [
                        {
                            type: Delta.MarkType.Modify,
                            fields: new Map([
                                [
                                    fooKey,
                                    [
                                        2,
                                        {
                                            type: Delta.MarkType.Modify,
                                            fields: new Map([
                                                [
                                                    fooKey,
                                                    [
                                                        {
                                                            type: Delta.MarkType.Insert,
                                                            content: [nodeXCursor],
                                                        },
                                                    ],
                                                ],
                                            ]),
                                        },
                                    ],
                                ],
                            ]),
                        },
                    ],
                ],
            ]);
            builder.optionalField(root_foo2, fooKey).set(singleTextCursor(nodeX), true);
            assertDeltasEqual(deltas, [expected]);
        });
    });

    describe("Sequence Field Edits", () => {
        it("Can insert a root node", () => {
            const deltas: Delta.Root[] = [];
            const builder = new DefaultEditBuilder(
                family,
                deltas.push.bind(deltas),
                new AnchorSet(),
            );
            const expected: Delta.Root = new Map([
                [
                    rootKey,
                    [
                        {
                            type: Delta.MarkType.Insert,
                            content: [nodeXCursor],
                        },
                    ],
                ],
            ]);
            builder.sequenceField(undefined, rootKey).insert(0, singleTextCursor(nodeX));
            assertDeltasEqual(deltas, [expected]);
        });

        it("Can insert a child node", () => {
            const deltas: Delta.Root[] = [];
            const builder = new DefaultEditBuilder(
                family,
                deltas.push.bind(deltas),
                new AnchorSet(),
            );
            const expected: Delta.Root = new Map([
                [
                    rootKey,
                    [
                        {
                            type: Delta.MarkType.Modify,
                            fields: new Map([
                                [
                                    fooKey,
                                    [
                                        2,
                                        {
                                            type: Delta.MarkType.Modify,
                                            fields: new Map([
                                                [
                                                    fooKey,
                                                    [
                                                        5,
                                                        {
                                                            type: Delta.MarkType.Insert,
                                                            content: [nodeXCursor],
                                                        },
                                                    ],
                                                ],
                                            ]),
                                        },
                                    ],
                                ],
                            ]),
                        },
                    ],
                ],
            ]);
            builder.sequenceField(root_foo2, fooKey).insert(5, singleTextCursor(nodeX));
            assertDeltasEqual(deltas, [expected]);
        });

        it("Can delete a root node", () => {
            const deltas: Delta.Root[] = [];
            const builder = new DefaultEditBuilder(
                family,
                deltas.push.bind(deltas),
                new AnchorSet(),
            );
            const expected: Delta.Root = new Map([
                [
                    rootKey,
                    [
                        {
                            type: Delta.MarkType.Delete,
                            count: 1,
                        },
                    ],
                ],
            ]);
            builder.sequenceField(undefined, rootKey).delete(0, 1);
            assertDeltasEqual(deltas, [expected]);
        });

        it("Can delete child nodes", () => {
            const deltas: Delta.Root[] = [];
            const builder = new DefaultEditBuilder(
                family,
                deltas.push.bind(deltas),
                new AnchorSet(),
            );
            const expected: Delta.Root = new Map([
                [
                    rootKey,
                    [
                        {
                            type: Delta.MarkType.Modify,
                            fields: new Map([
                                [
                                    fooKey,
                                    [
                                        2,
                                        {
                                            type: Delta.MarkType.Modify,
                                            fields: new Map([
                                                [
                                                    fooKey,
                                                    [
                                                        5,
                                                        {
                                                            type: Delta.MarkType.Delete,
                                                            count: 10,
                                                        },
                                                    ],
                                                ],
                                            ]),
                                        },
                                    ],
                                ],
                            ]),
                        },
                    ],
                ],
            ]);
            builder.sequenceField(root_foo2, fooKey).delete(5, 10);
            assertDeltasEqual(deltas, [expected]);
        });
    });
});

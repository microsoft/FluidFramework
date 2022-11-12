/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    Delta,
    FieldKey,
    initializeForest,
    InMemoryStoredSchemaRepository,
    RevisionTag,
    rootFieldKeySymbol,
    UpPath,
} from "../../core";
import { jsonNumber, jsonObject } from "../../domains";
import {
    defaultSchemaPolicy,
    ForestRepairDataStore,
    jsonableTreeFromCursor,
    ObjectForest,
    singleTextCursor,
} from "../../feature-libraries";
import { brand } from "../../util";

const revision: RevisionTag = brand(42);
const fooKey: FieldKey = brand("foo");

const root: UpPath = {
    parent: undefined,
    parentField: rootFieldKeySymbol,
    parentIndex: 0,
};

describe("ForestRepairDataStore", () => {
    it("Captures deleted nodes", () => {
        const schema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy);
        const forest = new ObjectForest(schema);
        const store = new ForestRepairDataStore((rev) => {
            assert.equal(rev, revision);
            return forest;
        });
        const nodesToCapture = [
            { type: jsonNumber.name, value: 1 },
            {
                type: jsonObject.name,
                fields: {
                    bar: [{ type: jsonNumber.name, value: 2 }],
                },
            },
        ];
        const data = {
            type: jsonObject.name,
            fields: {
                foo: [
                    { type: jsonNumber.name, value: 0 },
                    ...nodesToCapture,
                    { type: jsonNumber.name, value: 3 },
                ],
            },
        };
        initializeForest(forest, [singleTextCursor(data)]);
        store.capture({
            revision,
            changes: new Map([
                [
                    rootFieldKeySymbol,
                    [
                        {
                            type: Delta.MarkType.Modify,
                            fields: new Map([
                                [
                                    fooKey,
                                    [
                                        1,
                                        {
                                            type: Delta.MarkType.Delete,
                                            count: 2,
                                        },
                                    ],
                                ],
                            ]),
                        },
                    ],
                ],
            ]),
        });
        const nodes = store.getNodes(revision, root, fooKey, 1, 2);
        const actual = nodes.map(jsonableTreeFromCursor);
        assert.deepEqual(actual, nodesToCapture);
    });

    it("Captures overwritten values", () => {
        const schema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy);
        const forest = new ObjectForest(schema);
        const store = new ForestRepairDataStore((rev) => {
            assert.equal(rev, revision);
            return forest;
        });
        const data = {
            type: jsonObject.name,
            fields: {
                foo: [
                    { type: jsonNumber.name },
                    { type: jsonNumber.name, value: 1 },
                    { type: jsonNumber.name, value: 2 },
                    { type: jsonNumber.name, value: 3 },
                ],
            },
        };
        initializeForest(forest, [singleTextCursor(data)]);
        store.capture({
            revision,
            changes: new Map([
                [
                    rootFieldKeySymbol,
                    [
                        {
                            type: Delta.MarkType.Modify,
                            fields: new Map([
                                [
                                    fooKey,
                                    [
                                        {
                                            type: Delta.MarkType.Modify,
                                            setValue: 40,
                                        },
                                        1,
                                        {
                                            type: Delta.MarkType.Modify,
                                            setValue: 42,
                                        },
                                        {
                                            type: Delta.MarkType.Modify,
                                            setValue: undefined,
                                        },
                                    ],
                                ],
                            ]),
                        },
                    ],
                ],
            ]),
        });
        const value0 = store.getValue(revision, {
            parent: root,
            parentField: fooKey,
            parentIndex: 0,
        });
        const value2 = store.getValue(revision, {
            parent: root,
            parentField: fooKey,
            parentIndex: 2,
        });
        const value3 = store.getValue(revision, {
            parent: root,
            parentField: fooKey,
            parentIndex: 3,
        });
        assert.equal(value0, undefined);
        assert.equal(value2, 2);
        assert.equal(value3, 3);
    });
});

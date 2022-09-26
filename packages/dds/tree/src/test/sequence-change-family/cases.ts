/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Transposed as T, SequenceChangeset } from "../../feature-libraries";
import { brand } from "../../util";
import { TreeSchemaIdentifier } from "../../schema-stored";
import { Value } from "../../tree";

export function setRootValueTo(value: Value): SequenceChangeset {
    return {
        marks: {
            root: [{
                type: "Modify",
                value: { id: 0, value },
            }],
        },
    };
}

export function setChildValueTo(value: Value): SequenceChangeset {
    return {
        marks: {
            root: [{
                type: "Modify",
                fields: {
                    foo: [
                        42,
                        {
                            type: "Modify",
                            value: { id: 0, value },
                        },
                    ],
                },
            }],
        },
    };
}

export function asForest(markList: T.MarkList): SequenceChangeset {
    return {
        marks: { root: markList },
    };
}

const type: TreeSchemaIdentifier = brand("Node");
const tomb = "Dummy Changeset Tag";

export const cases: {
    no_change: SequenceChangeset;
    set_root_value: SequenceChangeset;
    set_child_value: SequenceChangeset;
    insert: SequenceChangeset;
    modify: SequenceChangeset;
    modify_insert: SequenceChangeset;
    delete: SequenceChangeset;
    revive: SequenceChangeset;
} = {
    no_change: {
        marks: {},
    },
    set_root_value: setRootValueTo(42),
    set_child_value: setRootValueTo(42),
    insert: {
        marks: {
            root: [
                1,
                { type: "Insert", id: 1, content: [{ type, value: 1 }, { type, value: 2 }] },
            ],
        },
    },
    modify: {
        marks: {
            root: [{
                type: "Modify",
                fields: {
                    foo: [
                        { type: "Insert", id: 2, content: [{ type, value: 2 }] },
                    ],
                },
            }],
        },
    },
    modify_insert: {
        marks: {
            root: [
                1,
                {
                    type: "MInsert",
                    id: 1,
                    content: { type, value: 1 },
                    fields: {
                        foo: [
                            { type: "Insert", id: 2, content: [{ type, value: 2 }] },
                        ],
                    },
                },
            ],
        },
    },
    delete: {
        marks: {
            root: [
                1,
                { type: "Delete", id: 1, count: 3 },
            ],
        },
    },
    revive: {
        marks: {
            root: [
                2,
                { type: "Revive", id: 1, count: 2, tomb },
            ],
        },
    },
};

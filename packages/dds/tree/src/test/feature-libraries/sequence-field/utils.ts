/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SequenceField as SF } from "../../../feature-libraries";
import { brand } from "../../../util";
import { TreeSchemaIdentifier } from "../../../schema-stored";
import { TestChange } from "../../testChange";

const type: TreeSchemaIdentifier = brand("Node");
const tomb = "Dummy Changeset Tag";

export type TestChangeset = SF.Changeset<TestChange>;

export const cases: {
    no_change: TestChangeset;
    insert: TestChangeset;
    modify: TestChangeset;
    modify_insert: TestChangeset;
    delete: TestChangeset;
    revive: TestChangeset;
} = {
    no_change: [],
    insert: [
        1,
        { type: "Insert", id: 1, content: [{ type, value: 1 }, { type, value: 2 }] },
    ],
    modify: [
        { type: "Modify", changes: TestChange.mint([], 1) },
    ],
    modify_insert: [
        1,
        {
            type: "MInsert",
            id: 1,
            content: { type, value: 1 },
            changes: TestChange.mint([], 2),
        },
    ],
    delete: [
        1,
        { type: "Delete", id: 1, count: 3 },
    ],
    revive: [
        2,
        { type: "Revive", id: 1, count: 2, tomb },
    ],
};

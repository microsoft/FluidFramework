/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SequenceField as SF } from "../../../feature-libraries";
import { brand } from "../../../util";
import { TreeSchemaIdentifier } from "../../../schema-stored";

const type: TreeSchemaIdentifier = brand("Node");
const tomb = "Dummy Changeset Tag";

export const cases: {
    no_change: SF.Changeset;
    insert: SF.Changeset;
    modify: SF.Changeset;
    modify_insert: SF.Changeset;
    delete: SF.Changeset;
    revive: SF.Changeset;
} = {
    no_change: [],
    insert: [
        1,
        { type: "Insert", id: 1, content: [{ type, value: 1 }, { type, value: 2 }] },
    ],
    modify: [
        { type: "Modify", changes: { valueChange: { value: 42 } } }
    ],
    modify_insert: [
        1,
        {
            type: "MInsert",
            id: 1,
            content: { type, value: 1 },
            changes: { valueChange: { value: 42 } },
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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Jsonable } from "@fluidframework/datastore-definitions";
// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { JsonCursor } from "../../../domains/json/jsonCursor";
import { FieldKey } from "../../../tree";
import { testCursors, testJsonCompatibleCursor } from "../../cursorLegacy.spec";

testJsonCompatibleCursor("JsonCursor", {
    factory: (data?: Jsonable) => new JsonCursor(data),
});

testCursors("JsonCursor", [
    {
        cursorName: "composite",
        cursor: new JsonCursor(
            { n: null, b: true, i: 0, s: "", a2: [null, true, 0, "", { n: null, b: true, i: 0, s: "", a2: [] }] },
        ),
    },
]);

testCursors("JsonCursor", [
    {
        cursorName: "composite",
        cursor: new JsonCursor(
            { n: null, b: true, i: 0, s: "", a2: [null, true, 0, "", { n: null, b: true, i: 0, s: "", a2: [] }] },
        ),
    },
]);

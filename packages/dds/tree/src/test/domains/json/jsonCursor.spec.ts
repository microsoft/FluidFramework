/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Jsonable } from "@fluidframework/datastore-definitions";
// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { JsonCursor } from "../../../domains/json/jsonCursor";
import { jsonCompatibleCursorTestCases, testCursors, testJsonCompatibleCursor } from "../../cursorLegacy.spec";

testJsonCompatibleCursor("JsonCursor", (data?: Jsonable) => new JsonCursor(data));

testCursors(
    "JsonCursor",
    jsonCompatibleCursorTestCases.map(([name, data]) => ({
        cursorName: name,
        cursor: new JsonCursor(data),
    })),
);

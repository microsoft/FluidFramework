/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { JsonCursor } from "../../../domains/json/jsonCursor";
import { testJsonCompatibleCursor } from "../../forest";

testJsonCompatibleCursor("JsonCursor", {
    factory: (data) => new JsonCursor(data),
});

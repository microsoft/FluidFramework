/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { getRequestedRange } from "../versionUtils";

describe("Get the major version number above or below the baseVersion", () => {
    assert.strictEqual(getRequestedRange("^1.0.0", -1), "^0.59.0-0");
    assert.strictEqual(getRequestedRange("^1.0.0", -2), "^0.58.0-0");
    assert.strictEqual(getRequestedRange("^1.0.0", 1), "^2.0.0-0");
    assert.strictEqual(getRequestedRange("^2.0.0", -1), "^1.0.0-0");
    assert.strictEqual(getRequestedRange("^2.0.0", 0), "^2.0.0");
    assert.strictEqual(getRequestedRange("^2.0.0", undefined), "^2.0.0");
});

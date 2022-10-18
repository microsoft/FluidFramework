/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { getRequestedRange } from "../versionUtils";

describe("Get the major version number above or below the baseVersion", () => {
    // assert for major bumps
    assert.strictEqual(getRequestedRange("1.0.0", -1), "^0.59.0-0");
    assert.strictEqual(getRequestedRange("1.0.0", -2), "^0.58.0-0");
    assert.strictEqual(getRequestedRange("1.0.0", 1), "^2.0.0-0");
    assert.strictEqual(getRequestedRange("2.0.0", -1), "^1.0.0-0");

    // assert for internal release
    assert.strictEqual(getRequestedRange("2.0.0-internal.1.0.0", -1), "^1.0.0-0");
    assert.strictEqual(getRequestedRange("2.0.0-internal.1.1.0", -1), "^1.0.0-0");
    assert.strictEqual(getRequestedRange("2.0.0-internal.1.1.1", -1), "^1.0.0-0");
    assert.strictEqual(getRequestedRange("2.0.0-internal.2.0.0", -2), "^1.0.0-0");

    assert.strictEqual(getRequestedRange("2.0.0-internal.2.0.0", -1), ">=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0");
    assert.strictEqual(getRequestedRange("2.0.0-internal.2.1.1", -1), ">=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0");
    assert.strictEqual(getRequestedRange("2.0.0-internal.2.0.0", -3), "^0.58.0-0");

    assert.strictEqual(getRequestedRange("2.0.0-internal.1.2.3", -1), "^1.0.0-0");
    assert.strictEqual(getRequestedRange("2.0.0-internal.2.1.0", -1), ">=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0");
    assert.strictEqual(getRequestedRange("2.0.0-internal.3.0.0", -1), ">=2.0.0-internal.2.0.0 <2.0.0-internal.3.0.0");

    // asserts for malformed major versions
    assert.strictEqual(getRequestedRange("2.0.0", 0), "2.0.0");
    assert.strictEqual(getRequestedRange("2.0.0", undefined), "2.0.0");
    assert.throws(() => getRequestedRange("-1.-2.-1", -1), Error, "TypeError: Invalid Version: -1.-2.-1");
    assert.throws(() => getRequestedRange("1.-2.-1", -1), Error, "TypeError: Invalid Version: 1.-2.-1");
    assert.throws(() => getRequestedRange("1.-2.-1", -1), Error, "TypeError: Invalid Version: 1.-2.-1");
    assert.throws(() => getRequestedRange("badString", -1), Error, "TypeError: Invalid Version: badString");

    // assert for minor bumps
    assert.strictEqual(getRequestedRange("0.59.1000", -1), "^0.58.0-0");
    assert.strictEqual(getRequestedRange("0.59.2000", -1), "^0.58.0-0");
    assert.strictEqual(getRequestedRange("0.59.2000", -1), "^0.58.0-0");

    // asserts for patch bumps
    assert.strictEqual(getRequestedRange("0.59.1001", -1), "^0.58.0-0");
    assert.strictEqual(getRequestedRange("0.59.1002", -1), "^0.58.0-0");
    assert.strictEqual(getRequestedRange("1.1.0", -1), "^0.59.0-0");
    assert.strictEqual(getRequestedRange("2.4.5", -1), "^1.0.0-0");
});

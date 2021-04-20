/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { getSimpleVersion } from "./buildVersion";

export function test() {
    // Test version with id, no prerelease
    assert.equal(getSimpleVersion("0.15.0", "12345.0", false, true), "0.15.12345");
    assert.equal(getSimpleVersion("0.15.0", "12345.0", true, true), "0.15.12345");

    // Test version with id, with prerelease
    assert.equal(getSimpleVersion("0.15.0-rc", "12345.0", false, true), "0.15.12345-rc");
    assert.equal(getSimpleVersion("0.15.0-alpha.1", "12345.0", false, true), "0.15.12345-alpha.1");
    assert.equal(getSimpleVersion("0.15.0-beta.2.1", "12345.0", false, true), "0.15.12345-beta.2.1");
    assert.equal(getSimpleVersion("0.15.0-beta", "12345.0", true, true), "0.15.12345-beta");

    // Test version no id, no prerelease
    assert.equal(getSimpleVersion("0.16.0", "12345.0", false, false), "0.16.0-12345.0");
    assert.equal(getSimpleVersion("0.16.0", "12345.0", true, false), "0.16.0");

    // Test version no id, with prerelease
    assert.equal(getSimpleVersion("0.16.0-rc", "12345.0", false, false), "0.16.0-rc.12345.0");
    assert.equal(getSimpleVersion("0.16.0-alpha.1", "12345.0", false, false), "0.16.0-alpha.1.12345.0");
    assert.equal(getSimpleVersion("0.16.0-beta.2.1", "12345.0", false, false), "0.16.0-beta.2.1.12345.0");
    assert.equal(getSimpleVersion("0.16.0-beta", "12345.0", true, false), "0.16.0-beta");
    console.log("Test passed!");
}

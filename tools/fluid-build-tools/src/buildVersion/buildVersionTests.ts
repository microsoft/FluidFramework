/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { getFullVersion, getSimpleVersion } from "./buildVersion";

export function test() {
    // Test version <= 0.15, no prerelease
    assert.equal(getFullVersion("0.15.0", "12345", "refs/pull/blah"), "0.15.12345");
    assert.equal(getFullVersion("0.15.0", "12345", "refs/heads/master"), "0.15.12345");
    assert.equal(getFullVersion("0.15.0", "12345.0", "refs/heads/release/0.15"), "0.15.12345");
    assert.equal(getFullVersion("0.15.0", "12345.0", "refs/heads/blah"), "0.15.12345");
    assert.equal(getFullVersion("0.15.0", "12345.0", "refs/tags/v0.15.x"), "0.15.12345");

    // Test version <= 0.15, with prerelease
    assert.equal(getFullVersion("0.15.0-rc", "12345.0", "refs/pull/blah"), "0.15.12345-rc");
    assert.equal(getFullVersion("0.15.0-alpha.1", "12345.0", "refs/heads/master"), "0.15.12345-alpha.1");
    assert.equal(getFullVersion("0.15.0-beta.2.1", "12345.0", "refs/heads/release/0.15"), "0.15.12345-beta.2.1");
    assert.equal(getFullVersion("0.15.0-beta.2.1", "12345.0", "refs/heads/blah"), "0.15.12345-beta.2.1");
    assert.equal(getFullVersion("0.15.0-beta", "12345.0", "refs/tags/v0.15.x"), "0.15.12345-beta");

    // Test version >= 0.16, no prerelease
    assert.equal(getFullVersion("0.16.0", "12345.0", "refs/pull/blah"), "0.16.0--ci.12345.dev");
    assert.equal(getFullVersion("0.16.0", "12345.0", "refs/heads/master"), "0.16.0--ci.12345.official");
    assert.equal(getFullVersion("0.16.0", "12345.0", "refs/heads/release/0.16.0"), "0.16.0--ci.12345.official");
    assert.equal(getFullVersion("0.16.0", "12345.0", "refs/heads/blah"), "0.16.0--ci.12345.manual");
    assert.equal(getFullVersion("0.16.0", "12345.0", "refs/tags/v0.16.0"), "0.16.0");

    // Test version >= 0.16, with prerelease
    assert.equal(getFullVersion("0.16.0-rc", "12345.0", "refs/pull/blah"), "0.16.0-rc.0.0.ci.12345.dev");
    assert.equal(getFullVersion("0.16.0-alpha.1", "12345.0", "refs/heads/master"), "0.16.0-alpha.1.0.ci.12345.official");
    assert.equal(getFullVersion("0.16.0-beta.2.1", "12345.0", "refs/heads/release/0.16.1"), "0.16.0-beta.2.1.ci.12345.official");
    assert.equal(getFullVersion("0.16.0-beta.2.1", "12345.0", "refs/heads/blah"), "0.16.0-beta.2.1.ci.12345.manual");
    assert.equal(getFullVersion("0.16.0-beta", "12345.0", "refs/tags/v0.16.0"), "0.16.0-beta");

    // Test version <= 0.15, no prerelease
    assert.equal(getSimpleVersion("0.15.0", "12345.0", "refs/pull/blah"), "0.15.12345");
    assert.equal(getSimpleVersion("0.15.0", "12345.0", "refs/heads/master"), "0.15.12345");
    assert.equal(getSimpleVersion("0.15.0", "12345.0", "refs/heads/release/0.15"), "0.15.12345");
    assert.equal(getSimpleVersion("0.15.0", "12345.0", "refs/heads/blah"), "0.15.12345");
    assert.equal(getSimpleVersion("0.15.0", "12345.0", "refs/tags/v0.15.x"), "0.15.12345");

    // Test version <= 0.15, with prerelease
    assert.equal(getSimpleVersion("0.15.0-rc", "12345.0", "refs/pull/blah"), "0.15.12345-rc");
    assert.equal(getSimpleVersion("0.15.0-alpha.1", "12345.0", "refs/heads/master"), "0.15.12345-alpha.1");
    assert.equal(getSimpleVersion("0.15.0-beta.2.1", "12345.0", "refs/heads/release/0.15"), "0.15.12345-beta.2.1");
    assert.equal(getSimpleVersion("0.15.0-beta.2.1", "12345.0", "refs/heads/blah"), "0.15.12345-beta.2.1");
    assert.equal(getSimpleVersion("0.15.0-beta", "12345.0", "refs/tags/v0.15.x"), "0.15.12345-beta");

    // Test version >= 0.16, no prerelease
    assert.equal(getSimpleVersion("0.16.0", "12345.0", "refs/pull/blah"), "0.16.0-12345");
    assert.equal(getSimpleVersion("0.16.0", "12345.0", "refs/heads/master"), "0.16.0-12345");
    assert.equal(getSimpleVersion("0.16.0", "12345.0", "refs/heads/release/0.16.0"), "0.16.0-12345");
    assert.equal(getSimpleVersion("0.16.0", "12345.0", "refs/heads/blah"), "0.16.0-12345");
    assert.equal(getSimpleVersion("0.16.0", "12345.0", "refs/tags/v0.16.0"), "0.16.0");

    // Test version >= 0.16, with prerelease
    assert.equal(getSimpleVersion("0.16.0-rc", "12345.0", "refs/pull/blah"), "0.16.0-rc.12345");
    assert.equal(getSimpleVersion("0.16.0-alpha.1", "12345.0", "refs/heads/master"), "0.16.0-alpha.1.12345");
    assert.equal(getSimpleVersion("0.16.0-beta.2.1", "12345.0", "refs/heads/release/0.16.1"), "0.16.0-beta.2.1.12345");
    assert.equal(getSimpleVersion("0.16.0-beta.2.1", "12345.0", "refs/heads/blah"), "0.16.0-beta.2.1.12345");
    assert.equal(getSimpleVersion("0.16.0-beta", "12345.0", "refs/tags/v0.16.0"), "0.16.0-beta");
    console.log("Test passed!");
}

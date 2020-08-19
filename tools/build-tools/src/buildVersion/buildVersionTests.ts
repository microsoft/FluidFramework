/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { getFullVersion, getSimpleVersion } from "./buildVersion";

export function test() {
    // Test version with id, no prerelease
    assert.equal(getFullVersion("0.15.0", "12345", "refs/pull/blah", true), "0.15.12345");
    assert.equal(getFullVersion("0.15.0", "12345", "refs/heads/main", true), "0.15.12345");
    assert.equal(getFullVersion("0.15.0", "12345.0", "refs/heads/release/0.15", true), "0.15.12345");
    assert.equal(getFullVersion("0.15.0", "12345.0", "refs/heads/blah", true), "0.15.12345");
    assert.equal(getFullVersion("0.15.0", "12345.0", "refs/tags/v0.15.x", true), "0.15.12345");

    // Test version with id, with prerelease
    assert.equal(getFullVersion("0.15.0-rc", "12345.0", "refs/pull/blah", true), "0.15.12345-rc");
    assert.equal(getFullVersion("0.15.0-alpha.1", "12345.0", "refs/heads/main", true), "0.15.12345-alpha.1");
    assert.equal(getFullVersion("0.15.0-beta.2.1", "12345.0", "refs/heads/release/0.15", true), "0.15.12345-beta.2.1");
    assert.equal(getFullVersion("0.15.0-beta.2.1", "12345.0", "refs/heads/blah", true), "0.15.12345-beta.2.1");
    assert.equal(getFullVersion("0.15.0-beta", "12345.0", "refs/tags/v0.15.x", true), "0.15.12345-beta");

    // Test version no id, no prerelease
    assert.equal(getFullVersion("0.16.0", "12345.0", "refs/pull/blah", false), "0.16.0--ci.12345.0.dev");
    assert.equal(getFullVersion("0.16.0", "12345.0", "refs/heads/main", false), "0.16.0--ci.12345.0.official");
    assert.equal(getFullVersion("0.16.0", "12345.0", "refs/heads/release/0.16.0", false), "0.16.0--ci.12345.0.official");
    assert.equal(getFullVersion("0.16.0", "12345.0", "refs/heads/blah", false), "0.16.0--ci.12345.0.manual");
    assert.equal(getFullVersion("0.16.0", "12345.0", "refs/tags/v0.16.0", false), "0.16.0");

    // Test version no id, with prerelease
    assert.equal(getFullVersion("0.16.0-rc", "12345.0", "refs/pull/blah", false), "0.16.0-rc.0.0.ci.12345.0.dev");
    assert.equal(getFullVersion("0.16.0-alpha.1", "12345.0", "refs/heads/main", false), "0.16.0-alpha.1.0.ci.12345.0.official");
    assert.equal(getFullVersion("0.16.0-beta.2.1", "12345.0", "refs/heads/release/0.16.1", false), "0.16.0-beta.2.1.ci.12345.0.official");
    assert.equal(getFullVersion("0.16.0-beta.2.1", "12345.0", "refs/heads/blah", false), "0.16.0-beta.2.1.ci.12345.0.manual");
    assert.equal(getFullVersion("0.16.0-beta", "12345.0", "refs/tags/v0.16.0", false), "0.16.0-beta");

    // Test version with id, no prerelease
    assert.equal(getSimpleVersion("0.15.0", "12345.0", "refs/pull/blah", true), "0.15.12345");
    assert.equal(getSimpleVersion("0.15.0", "12345.0", "refs/heads/main", true), "0.15.12345");
    assert.equal(getSimpleVersion("0.15.0", "12345.0", "refs/heads/release/0.15", true), "0.15.12345");
    assert.equal(getSimpleVersion("0.15.0", "12345.0", "refs/heads/blah", true), "0.15.12345");
    assert.equal(getSimpleVersion("0.15.0", "12345.0", "refs/tags/v0.15.x", true), "0.15.12345");

    // Test version with id, with prerelease
    assert.equal(getSimpleVersion("0.15.0-rc", "12345.0", "refs/pull/blah", true), "0.15.12345-rc");
    assert.equal(getSimpleVersion("0.15.0-alpha.1", "12345.0", "refs/heads/main", true), "0.15.12345-alpha.1");
    assert.equal(getSimpleVersion("0.15.0-beta.2.1", "12345.0", "refs/heads/release/0.15", true), "0.15.12345-beta.2.1");
    assert.equal(getSimpleVersion("0.15.0-beta.2.1", "12345.0", "refs/heads/blah", true), "0.15.12345-beta.2.1");
    assert.equal(getSimpleVersion("0.15.0-beta", "12345.0", "refs/tags/v0.15.x", true), "0.15.12345-beta");

    // Test version no id, no prerelease
    assert.equal(getSimpleVersion("0.16.0", "12345.0", "refs/pull/blah", false), "0.16.0-12345.0");
    assert.equal(getSimpleVersion("0.16.0", "12345.0", "refs/heads/main", false), "0.16.0-12345.0");
    assert.equal(getSimpleVersion("0.16.0", "12345.0", "refs/heads/release/0.16.0", false), "0.16.0-12345.0");
    assert.equal(getSimpleVersion("0.16.0", "12345.0", "refs/heads/blah", false), "0.16.0-12345.0");
    assert.equal(getSimpleVersion("0.16.0", "12345.0", "refs/tags/v0.16.0", false), "0.16.0");

    // Test version no id, with prerelease
    assert.equal(getSimpleVersion("0.16.0-rc", "12345.0", "refs/pull/blah", false), "0.16.0-rc.12345.0");
    assert.equal(getSimpleVersion("0.16.0-alpha.1", "12345.0", "refs/heads/main", false), "0.16.0-alpha.1.12345.0");
    assert.equal(getSimpleVersion("0.16.0-beta.2.1", "12345.0", "refs/heads/release/0.16.1", false), "0.16.0-beta.2.1.12345.0");
    assert.equal(getSimpleVersion("0.16.0-beta.2.1", "12345.0", "refs/heads/blah", false), "0.16.0-beta.2.1.12345.0");
    assert.equal(getSimpleVersion("0.16.0-beta", "12345.0", "refs/tags/v0.16.0", false), "0.16.0-beta");
    console.log("Test passed!");
}

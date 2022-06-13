/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { getSimpleVersion, getVersionsFromStrings, getIsLatest } from "./buildVersion";

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

    // Test isLatest
    assert.equal(getIsLatest("client", "0.59.4000", []), true);
    assert.equal(getIsLatest("client", "0.59.4000-1234", []), false);

    // Deliberately not sorted here; highest version is 0.59.3000
    const test_tags = [
        "client_v0.59.1001-62246",
        "client_v0.59.2000-63294",
        "client_v0.59.2002",
        "client_v0.59.1000",
        "client_v0.59.3000-67119",
        "client_v0.59.3000",
        "client_v0.59.2001",
        "client_v0.59.3000-66610",
        "client_v0.59.2000",
        "client_v0.59.1001",
    ];
    const versions = getVersionsFromStrings("client", test_tags);

    // Highest version should be 0.59.3000
    assert.equal(versions.slice(-1)[0], "0.59.3000");
    for (const v of versions) {
        console.log(v);
    }

    assert.equal(getIsLatest("client", "0.59.4000", test_tags), true);
    assert.equal(getIsLatest("client", "0.59.3001", test_tags), true);
    assert.equal(getIsLatest("client", "0.59.4000-1234", test_tags), false);
    assert.equal(getIsLatest("client", "0.60.1000-1234", test_tags), false);

    // Add a higher version tag to simulate a release
    // Highest version is now 0.60.2000
    test_tags.push("client_v0.60.1000", "client_v0.60.2000");

    assert.equal(getIsLatest("client", "0.59.4000", test_tags), false);
    assert.equal(getIsLatest("client", "0.60.1001", test_tags), false);
    assert.equal(getIsLatest("client", "0.59.4001-1234", test_tags), false);
    assert.equal(getIsLatest("client", "0.60.3000-1234", test_tags), false);
    assert.equal(getIsLatest("client", "0.60.3000", test_tags), true);

    console.log("Test passed!");
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */

import { assert } from "chai";
import { detectVersionScheme, getLatestReleaseFromList, getSchemeForPackage } from "../src/schemes";

const versionList = [
    '0.36.0',
    '0.36.1',
    '0.36.2-20364',
    '0.37.0-20517',
    '0.37.0',
    '0.37.1',
    '0.37.2',
    '0.37.3-21287',
    '0.38.0-21934',
    '0.38.0',
    '0.58.0-55561',
    '0.58.0-55983',
    '0.58.1000',
    '0.58.1001',
    '0.58.2000-58133',
    '0.58.2000',
    '0.58.2001',
    '0.58.2002',
    '0.58.3000-61081',
    '0.59.1000-61898',
    '0.59.1000',
    '0.59.1001-62246',
    '0.59.1001',
    '0.59.2000-61729',
    '0.59.2000-63294',
    '0.59.2000',
    '0.59.2001',
    '0.59.2002',
    '0.59.2003',
    '0.59.3000-66610',
    '0.59.3000-67119',
    '0.59.3000',
    '0.59.3001',
    '0.59.3002',
    '0.59.3003',
    '0.59.4000-71128',
    '0.59.4000-71130',
    '0.59.4000',
    '0.59.4001',
    '0.59.4002',
    // '1.0.0',
    // '1.0.1',
    // '1.0.2',
    // '1.1.0-75972',
    // '1.1.0-76254',
    // '1.1.0',
    // '1.1.1',
    // '1.1.2',
    // '1.2.0-77818',
    // '1.2.0-78837',
    // '1.2.0',
    // '1.2.1',
    // '1.2.2',
    // '1.2.3-83900',
    '2.0.0-internal.1.0.0.81589',
    '2.0.0-internal.1.0.0.81601',
    '2.0.0-internal.1.0.0.82159',
    '2.0.0-internal.1.0.0.82628',
    '2.0.0-internal.1.0.0.82693',
    '2.0.0-internal.1.0.0.83139',
    '2.0.0-internal.1.0.1.67543',
  ];

describe("detectVersionScheme", () => {
    it("detects 2.0.0-internal.1.0.0 is internal", () => {
        const input = `2.0.0-internal.1.0.0`;
        const expected = "internal";
        assert.strictEqual(detectVersionScheme(input), expected);
    });

    it("detects 2.0.0-internal.1.1.0 is internal", () => {
        const input = `2.0.0-internal.1.1.0`;
        const expected = "internal";
        assert.strictEqual(detectVersionScheme(input), expected);
    });

    it("detects 2.0.0-internal.1.0.0.85674 is internalPrerelease", () => {
        const input = `2.0.0-internal.1.0.0.85674`;
        const expected = "internalPrerelease";
        assert.strictEqual(detectVersionScheme(input), expected);
    });

    it("detects >=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0 is internal", () => {
        const input = `>=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0`;
        const expected = "internal";
        assert.strictEqual(detectVersionScheme(input), expected);
    });

    it("detects ~0.59.3002 is virtualPatch", () => {
        const input = `~0.59.3002`;
        const expected = "virtualPatch";
        assert.strictEqual(detectVersionScheme(input), expected);
    });

    it("detects ~0.59.1 is semver", () => {
        const input = `~0.59.1`;
        const expected = "semver";
        assert.strictEqual(detectVersionScheme(input), expected);
    });

    it("detects ^1.2.0 is semver", () => {
        const input = `^1.2.0`;
        const expected = "semver";
        assert.strictEqual(detectVersionScheme(input), expected);
    });

    it("detects ^0.24.0 is semver", () => {
        const input = `^0.24.0`;
        const expected = "semver";
        assert.strictEqual(detectVersionScheme(input), expected);
    });

    it("detects 1.2.1001 is semver", () => {
        const input = `1.2.1001`;
        const expected = "semver";
        assert.strictEqual(detectVersionScheme(input), expected);
    });
});

describe("getLatestReleaseFromList", () => {
    it("detects 1.2.2 is latest release", () => {
        const expected = "1.2.2";
        const latest = getLatestReleaseFromList(versionList);
        assert.strictEqual(latest, expected);
    });

    it("detects 2.0.0-internal.1.0.1 is latest release", () => {
        const expected = "2.0.0-internal.1.0.1";
        versionList.push(expected);
        const latest = getLatestReleaseFromList(versionList);
        assert.strictEqual(latest, expected);
    });

    it("detects 0.59.4002 is latest release", () => {
        const expected = "2.0.0-internal.1.0.1";
        versionList.push(expected);
        const latest = getLatestReleaseFromList(versionList);
        assert.strictEqual(latest, expected);
    });
});

describe("getSchemeForPackage", () => {
    it("@fluidframework/container-runtime is internal", () => {
        const input = "@fluidframework/container-runtime";
        const expected = "internal";
        assert.strictEqual(getSchemeForPackage(input), expected);
    });

    it("@fluidframework/server-local-server is virtualPatch", () => {
        const input = "@fluidframework/server-local-server";
        const expected = "virtualPatch";
        assert.strictEqual(getSchemeForPackage(input), expected);
    });

    it("tinylicious is semver", () => {
        const input = "tinylicious";
        const expected = "semver";
        assert.strictEqual(getSchemeForPackage(input), expected);
    });

});

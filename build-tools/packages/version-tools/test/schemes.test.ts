/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */

import { assert } from "chai";
import { detectVersionScheme } from "../src/schemes";

describe("detectVersionScheme", () => {
    it("detects 2.0.0-internal.1.0.0 is internal", () => {
        const input = `2.0.0-internal.1.0.0`;
        const expected = "internal";
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

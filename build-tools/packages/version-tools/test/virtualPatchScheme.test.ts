/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */
import { assert } from "chai";

import { isVersionBumpType } from "../src/bumpTypes";
import {
    bumpVirtualPatchVersion,
    fromVirtualPatchScheme,
    toVirtualPatchScheme,
} from "../src/virtualPatchScheme";

describe("virtualPatch scheme", () => {
    describe("converting FROM virtualPatch scheme", () => {
        it("parses 0.3.1000", () => {
            const input = `0.3.1000`;
            const expected = `3.1.0`;
            const calculated = fromVirtualPatchScheme(input);
            assert.strictEqual(calculated.version, expected);
        });

        it("parses 0.4.2001", () => {
            const input = `0.4.2001`;
            const expected = `4.2.1`;
            const calculated = fromVirtualPatchScheme(input);
            assert.strictEqual(calculated.version, expected);
        });

        it("parses 0.4.2000", () => {
            const input = `0.4.2000`;
            const expected = `4.2.0`;
            const calculated = fromVirtualPatchScheme(input);
            assert.strictEqual(calculated.version, expected);
        });

        it("parses 0.1.1003", () => {
            const input = `0.1.1003`;
            const expected = `1.1.3`;
            const calculated = fromVirtualPatchScheme(input);
            assert.strictEqual(calculated.version, expected);
        });

        it("parses 0.3.1002", () => {
            const input = `0.3.1002`;
            const expected = `3.1.2`;
            const calculated = fromVirtualPatchScheme(input);
            assert.strictEqual(calculated.version, expected);
        });

        it("parses 0.39.5021", () => {
            const input = `0.39.5021`;
            const expected = `39.5.21`;
            const calculated = fromVirtualPatchScheme(input);
            assert.strictEqual(calculated.version, expected);
        });

        it("throws on 1.2.1001 (major must be 0)", () => {
            const input = `1.2.1001`;
            assert.throws(() => fromVirtualPatchScheme(input));
        });
    });

    describe("converting TO virtualPatch scheme", () => {
        it("converts 1.0.0 to virtualPatch scheme", () => {
            const input = `1.0.0`;
            const expected = `0.1.1000`;
            const calculated = toVirtualPatchScheme(input);
            assert.strictEqual(calculated.version, expected);
        });

        it("converts 1.1.3 to virtualPatch scheme", () => {
            const input = `1.1.3`;
            const expected = `0.1.1003`;
            const calculated = toVirtualPatchScheme(input);
            assert.strictEqual(calculated.version, expected);
        });

        it("converts 1.0.3 to virtualPatch scheme", () => {
            const input = `1.0.3`;
            const expected = `0.1.1003`;
            const calculated = toVirtualPatchScheme(input);
            assert.strictEqual(calculated.version, expected);
        });

        it("returns 0.59.2001 since it's already in virtualPatch scheme", () => {
            const input = `0.59.2001`;
            const expected = `0.59.2001`;
            const calculated = toVirtualPatchScheme(input);
            assert.strictEqual(calculated.version, expected);
        });

        it("throws when passed nonsense", () => {
            const input = `nonsense`;
            assert.throws(() => toVirtualPatchScheme(input));
        });
    });

    describe("bumpVirtualPatch", () => {
        it("bumps 0.59.3002 major using virtualPatch scheme", () => {
            const input = `0.59.3002`;
            const expected = `0.60.1000`;
            const calculated = bumpVirtualPatchVersion("major", input);
            assert.isFalse(isVersionBumpType(calculated));
            assert(!isVersionBumpType(calculated));
            assert.strictEqual(calculated.version, expected);
        });

        it("bumps 0.58.1002 minor using virtualPatch scheme", () => {
            const input = `0.58.1002`;
            const expected = `0.58.2000`;
            const calculated = bumpVirtualPatchVersion("minor", input);
            assert.isFalse(isVersionBumpType(calculated));
            assert(!isVersionBumpType(calculated));
            assert.strictEqual(calculated.version, expected);
        });

        it("bumps 0.58.1002 patch using virtualPatch scheme", () => {
            const input = `0.58.1002`;
            const expected = `0.58.1003`;
            const calculated = bumpVirtualPatchVersion("patch", input);
            assert.isFalse(isVersionBumpType(calculated));
            assert(!isVersionBumpType(calculated));
            assert.strictEqual(calculated.version, expected);
        });

        it("bumps 0.58.0 minor => 0.58.1000", () => {
            const input = `0.58.0`;
            const expected = `0.58.1000`;
            const calculated = bumpVirtualPatchVersion("minor", input);
            assert.isFalse(isVersionBumpType(calculated));
            assert(!isVersionBumpType(calculated));
            assert.strictEqual(calculated.version, expected);
        });

        it("bumps 0.58.1 minor => 0.58.1000", () => {
            const input = `0.58.1`;
            const expected = `0.58.1000`;
            const calculated = bumpVirtualPatchVersion("minor", input);
            assert.isFalse(isVersionBumpType(calculated));
            assert(!isVersionBumpType(calculated));
            assert.strictEqual(calculated.version, expected);
        });

        it("bumps 0.58.2 minor => 0.58.1000", () => {
            const input = `0.58.2`;
            const expected = `0.58.1000`;
            const calculated = bumpVirtualPatchVersion("minor", input);
            assert.isFalse(isVersionBumpType(calculated));
            assert(!isVersionBumpType(calculated));
            assert.strictEqual(calculated.version, expected);
        });

        it("bumps 0.58.2000 minor using virtualPatch scheme", () => {
            const input = `0.58.2000`;
            const expected = `0.58.3000`;
            const calculated = bumpVirtualPatchVersion("minor", input);
            assert.isFalse(isVersionBumpType(calculated));
            assert(!isVersionBumpType(calculated));
            assert.strictEqual(calculated.version, expected);
        });

        it("1.2.3 throws", () => {
            const input = `1.2.3`;
            assert.throws(() => bumpVirtualPatchVersion("minor", input));
        });
    });
});

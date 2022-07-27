/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */

import { assert } from "chai";
import * as semver from "semver";
import {
    fromInternalScheme,
    toInternalScheme,
    getVersionRange,
    isInternalVersionScheme,
    isInternalVersionRange,
} from "../src/internalVersionScheme";

describe("internalScheme", () => {
    describe("checking for internal version scheme", () => {
        it("2.0.0-internal.1.0.0 is internal scheme", () => {
            const input = `2.0.0-internal.1.0.0`;
            const result = isInternalVersionScheme(input);
            assert.isTrue(result);
        });

        it("2.0.0-alpha.1.0.0 is not internal scheme (must use internal)", () => {
            const input = `2.0.0-alpha.1.0.0`;
            const result = isInternalVersionScheme(input);
            assert.isFalse(result);
        });

        it("1.1.1-internal.1.0.0 is not internal scheme (public must be 2.0.0+)", () => {
            const input = `1.1.1-internal.1.0.0`;
            const result = isInternalVersionScheme(input);
            assert.isFalse(result);
        });

        it("2.0.0-internal.1.1.0.0 is not internal scheme (prerelease must only have four items)", () => {
            const input = `2.0.0-internal.1.1.0.0`;
            const result = isInternalVersionScheme(input);
            assert.isFalse(result);
        });

        it("2.0.0 is not internal scheme (no prerelease)", () => {
            const input = `2.0.0`;
            const result = isInternalVersionScheme(input);
            assert.isFalse(result);
        });

        it(">=2.0.0-internal.1.0.0 <2.0.0-internal.1.1.0 is internal", () => {
            const input = `>=2.0.0-internal.1.0.0 <2.0.0-internal.1.1.0`;
            assert.isTrue(isInternalVersionRange(input));
        });

        it(">=2.0.0-internal.2.2.1 <2.0.0-internal.3.0.0 is internal", () => {
            const input = `>=2.0.0-internal.2.2.1 <2.0.0-internal.3.0.0`;
            assert.isTrue(isInternalVersionRange(input));
        });

        it(">=1.0.0 <2.0.0 is not internal", () => {
            const input = `>=1.0.0 <2.0.0`;
            assert.isFalse(isInternalVersionRange(input));
        });

        it(">=2.0.0-2.2.1 <2.0.0-3.0.0 is not internal", () => {
            const input = `>=2.0.0-2.2.1 <2.0.0-3.0.0`;
            assert.isFalse(isInternalVersionRange(input));
        });

        it("^2.0.0-internal.2.2.1 is not internal", () => {
            const input = `^2.0.0-internal.2.2.1`;
            assert.isFalse(isInternalVersionRange(input));
        });
    });

    describe("converting FROM internal scheme", () => {
        it("parses 2.0.0-internal.1.0.0", () => {
            const input = `2.0.0-internal.1.0.0`;
            const expected = `1.0.0`;
            const [_, calculated] = fromInternalScheme(input);
            assert.strictEqual(calculated.version, expected);
        });

        it("throws on 2.0.0-alpha.1.0.0 (must use internal)", () => {
            const input = `2.0.0-alpha.1.0.0`;
            assert.throws(() => fromInternalScheme(input));
        });

        it("throws on 1.1.1-alpha.1.0.0 (public must be 2.0.0+)", () => {
            const input = `1.1.1-internal.1.0.0`;
            assert.throws(() => fromInternalScheme(input));
        });

        it("throws on 2.0.0-internal.1.1.0.0 (prerelease must only have four items)", () => {
            const input = `2.0.0-internal.1.1.0.0`;
            assert.throws(() => fromInternalScheme(input));
        });
    });

    describe("converting TO internal scheme", () => {
        it("converts 1.0.0 to internal version with public version 2.2.2", () => {
            const input = `1.0.0`;
            const expected = `2.2.2-internal.1.0.0`;
            const calculated = toInternalScheme("2.2.2", input);
            assert.strictEqual(calculated.version, expected);
        });

        it("throws when resulting version does not conform to the scheme", () => {
            const input = `1.0.0`;
            assert.throws(() => toInternalScheme("1.2.2", input));
        });
    });

    describe("version ranges", () => {
        it("tilde ~ dependency equivalent (auto-upgrades patch versions)", () => {
            const input = `2.0.0-internal.1.0.0`;
            const expected = `>=2.0.0-internal.1.0.0 <2.0.0-internal.1.1.0`;
            const range = getVersionRange(input, "patch");
            assert.strictEqual(range, expected);

            // Check that patch bumps satisfy the range
            assert.isTrue(semver.satisfies(`2.0.0-internal.1.0.0`, range));
            assert.isTrue(semver.satisfies(`2.0.0-internal.1.0.1`, range));
            assert.isTrue(semver.satisfies(`2.0.0-internal.1.0.2`, range));
            assert.isTrue(semver.satisfies(`2.0.0-internal.1.0.3`, range));

            // Check that minor and major bumps do not saisfy the range
            assert.isFalse(semver.satisfies(`2.0.0-internal.1.1.0`, range));
            assert.isFalse(semver.satisfies(`2.0.0-internal.2.1.0`, range));
        });

        it("caret ^ dependency equivalent (auto-upgrades minor versions)", () => {
            const input = `2.0.0-internal.1.0.0`;
            const expected = `>=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0`;
            const range = getVersionRange(input, "minor");
            assert.strictEqual(range, expected);

            // Check that minor and patch bumps satisfy the range
            assert.isTrue(semver.satisfies(`2.0.0-internal.1.0.1`, range));
            assert.isTrue(semver.satisfies(`2.0.0-internal.1.1.1`, range));
            assert.isTrue(semver.satisfies(`2.0.0-internal.1.2.2`, range));
            assert.isTrue(semver.satisfies(`2.0.0-internal.1.3.3`, range));

            // Check that major bumps do not saisfy the range
            assert.isFalse(semver.satisfies(`2.0.0-internal.2.0.0`, range));
            assert.isFalse(semver.satisfies(`2.0.0-internal.3.1.0`, range));
        });
    });
});

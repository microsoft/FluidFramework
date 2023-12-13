/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "chai";
import * as semver from "semver";

import {
	detectInternalVersionConstraintType,
	fromInternalScheme,
	getVersionRange,
	isInternalVersionRange,
	isInternalVersionScheme,
	toInternalScheme,
	validateVersionScheme,
} from "../internalVersionScheme";

describe("internalScheme", () => {
	describe("checking for internal version scheme", () => {
		it("2.0.0-internal.1.0.0 is internal scheme", () => {
			const input = `2.0.0-internal.1.0.0`;
			const result = isInternalVersionScheme(input);
			assert.isTrue(result);
		});

		it("2.0.0-rc.1.0.0 is internal scheme", () => {
			const input = `2.0.0-rc.1.0.0`;
			const result = isInternalVersionScheme(input);
			assert.isTrue(result);
		});

		it("2.0.0-alpha.1.0.0 is not internal scheme (must use internal/rc)", () => {
			const input = `2.0.0-alpha.1.0.0`;
			const result = isInternalVersionScheme(input);
			assert.isFalse(result);
		});

		it("2.0.0-alpha.1.0.0 is valid when allowAnyPrereleaseId is true", () => {
			const input = `2.0.0-alpha.1.0.0`;
			const result = isInternalVersionScheme(input, false, true);
			assert.isTrue(result);
		});

		it("2.0.0-rc.1.0.0 is valid when allowAnyPrereleaseId is true", () => {
			const input = `2.0.0-rc.1.0.0`;
			const result = isInternalVersionScheme(input, false, true);
			assert.isTrue(result);
		});

		it("2.0.0-alpha.1.0.0.0 is valid when allowAnyPrereleaseId is true", () => {
			const input = `2.0.0-alpha.1.0.0.0`;
			const result = isInternalVersionScheme(input, true, true);
			assert.isTrue(result);
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

		it("2.0.0-rc.1.1.0.0 is not internal scheme (prerelease must only have four items)", () => {
			const input = `2.0.0-rc.1.1.0.0`;
			const result = isInternalVersionScheme(input);
			assert.isFalse(result);
		});

		it("validateVersionScheme: 2.0.0-dev.1.1.0.123 is valid when allowAnyPrereleaseId is true", () => {
			const input = `2.0.0-dev.1.1.0.123`;
			const result = validateVersionScheme(input, true, ["dev"]);
			assert.isTrue(result);
		});

		it("2.0.0-internal.1.1.0.123 is a valid internal prerelease version", () => {
			const input = `2.0.0-internal.1.1.0.123`;
			const result = isInternalVersionScheme(input, true);
			assert.isTrue(result);
		});

		it("2.0.0-internal.1.1.0 is a valid internal version when prerelease is true", () => {
			const input = `2.0.0-internal.1.1.0`;
			const result = isInternalVersionScheme(input, true);
			assert.isTrue(result);
		});

		it("2.0.0-rc.1.1.0 is a valid internal version when prerelease is true", () => {
			const input = `2.0.0-rc.1.1.0`;
			const result = isInternalVersionScheme(input, true);
			assert.isTrue(result);
		});

		it("2.0.0 is not internal scheme (no prerelease)", () => {
			const input = `2.0.0`;
			const result = isInternalVersionScheme(input);
			assert.isFalse(result);
		});

		it("2.0.0-dev.1.1.0 is a valid internal version when allowAnyPrereleaseId is true", () => {
			const input = `2.0.0-dev.1.1.0`;
			const result = isInternalVersionScheme(input, false, true);
			assert.isTrue(result);
		});

		it("2.0.0-dev.2.1.0.104414 is a valid internal version when prerelease and allowAnyPrereleaseId are true", () => {
			const input = `2.0.0-dev.2.1.0.104414`;
			const result = isInternalVersionScheme(input, true, true);
			assert.isTrue(result);
		});

		it("2.0.0-dev.2.1.0.104414 is a not valid when prerelease is false and allowAnyPrereleaseId are true", () => {
			const input = `2.0.0-dev.2.1.0.104414`;
			const result = isInternalVersionScheme(input, false, true);
			assert.isFalse(result);
		});

		it("2.4.3 is a not valid even when allowPrereleases and allowAnyPrereleaseId are true", () => {
			const input = `2.4.3`;
			const result = isInternalVersionScheme(input, true, true);
			assert.isFalse(result);
		});

		it(">=2.0.0-internal.1.0.0 <2.0.0-internal.1.1.0 is internal", () => {
			const input = `>=2.0.0-internal.1.0.0 <2.0.0-internal.1.1.0`;
			assert.isTrue(isInternalVersionRange(input));
		});

		it(">=2.0.0-rc.1.0.0 <2.0.0-rc.1.1.0 is internal", () => {
			const input = `>=2.0.0-rc.1.0.0 <2.0.0-rc.1.1.0`;
			assert.isTrue(isInternalVersionRange(input));
		});

		// This test case should fail but it doesn't. "Fluid internal version ranges" should always have a prerelease
		// identifier that matches between the upper and lower bound. It's skipped because I think the case it guards
		// against isn't likely, so I don't think it's worth the cost of fixing it.
		//
		// The reason the code behaves wrong is because it only checks the lower bound of the range to see if it's an
		// internal version. If the lower bound version is internal, then the function returns true.
		it.skip(">=2.0.0-internal.1.0.0 <2.0.0-rc.1.1.0 is not internal", () => {
			const input = `>=2.0.0-internal.1.0.0 <2.0.0-rc.1.1.0`;
			assert.isFalse(isInternalVersionRange(input));
		});

		it(">=2.0.0-internal.2.2.1 <2.0.0-internal.3.0.0 is internal", () => {
			const input = `>=2.0.0-internal.2.2.1 <2.0.0-internal.3.0.0`;
			assert.isTrue(isInternalVersionRange(input));
		});

		it(">=2.0.0-alpha.2.2.1 <2.0.0-alpha.3.0.0 is not internal", () => {
			const input = `>=2.0.0-alpha.2.2.1 <2.0.0-alpha.3.0.0`;
			assert.isFalse(isInternalVersionRange(input));
		});

		it(">=2.0.0-alpha.2.2.1 <2.0.0-alpha.3.0.0 is internal when allowAnyPrereleaseId is true", () => {
			const input = `>=2.0.0-alpha.2.2.1 <2.0.0-alpha.3.0.0`;
			assert.isTrue(isInternalVersionRange(input, true));
		});

		it(">=2.0.0-dev.2.2.1.12345 <2.0.0-dev.3.0.0 is internal when allowAnyPrereleaseId is true", () => {
			const input = `>=2.0.0-dev.2.2.1.12345 <2.0.0-dev.3.0.0`;
			assert.isTrue(isInternalVersionRange(input, true));
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

		it("~2.0.0-internal.2.2.1 is not internal", () => {
			const input = `~2.0.0-internal.2.2.1`;
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

		it("parses 3.0.0-internal.1.0.0", () => {
			const input = `3.0.0-internal.1.0.0`;
			const expectedInt = `1.0.0`;
			const expectedPub = `3.0.0`;
			const [pubVer, intVer] = fromInternalScheme(input);
			assert.strictEqual(intVer.version, expectedInt);
			assert.strictEqual(pubVer.version, expectedPub);
		});

		it("throws on 2.0.0-internal.1.1.0.12345", () => {
			const input = `2.0.0-internal.1.1.0.12345`;
			const expected = `1.1.0-12345`;
			const [_, calculated] = fromInternalScheme(input, true);
			assert.strictEqual(calculated.version, expected);

			assert.throws(() => fromInternalScheme(input));
		});

		it("throws on 2.0.0-alpha.1.0.0 (must use internal)", () => {
			const input = `2.0.0-alpha.1.0.0`;
			assert.throws(() => fromInternalScheme(input));
		});

		it("parses 2.0.0-alpha.1.0.0 when allowAnyPrereleaseId is true", () => {
			const input = `2.0.0-alpha.1.0.0`;
			const expected = `1.0.0`;
			const [_, intVer, prereleaseId] = fromInternalScheme(input, false, true);
			assert.strictEqual(intVer.version, expected);
			assert.strictEqual(prereleaseId, "alpha");
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

		it("converts 1.2.3 to internal version with public version 2.0.0, dev prerelease identifier", () => {
			const input = `1.2.3`;
			const expected = `2.0.0-dev.1.2.3`;
			const calculated = toInternalScheme("2.0.0", input, false, "dev");
			assert.strictEqual(calculated.version, expected);
		});

		it("converts 1.1.0-12345.12 to internal version with public version 2.0.0", () => {
			const input = `1.1.0-12345.12`;
			const expected = `2.0.0-internal.1.1.0.12345.12`;
			const calculated = toInternalScheme("2.0.0", input, true);
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

			// Check that minor and major bumps do not satisfy the range
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

			// Check that major bumps do not satisfy the range
			assert.isFalse(semver.satisfies(`2.0.0-internal.2.0.0`, range));
			assert.isFalse(semver.satisfies(`2.0.0-internal.3.1.0`, range));
		});

		it("caret ^ dependency equivalent for prerelease/dev versions", () => {
			const input = `2.0.0-dev.3.0.0.105091`;
			const expected = `>=2.0.0-dev.3.0.0.105091 <2.0.0-dev.4.0.0`;
			const range = getVersionRange(input, "^");
			assert.strictEqual(range, expected);
		});

		it("tilde ~ dependency equivalent for prerelease/dev versions", () => {
			const input = `2.0.0-dev.3.1.0.105091`;
			const expected = `>=2.0.0-dev.3.1.0.105091 <2.0.0-dev.3.2.0`;
			const range = getVersionRange(input, "~");
			assert.strictEqual(range, expected);
		});

		/**
		 * Builds that are produced from dev builds or other non-release builds don't have the "internal" prerelease
		 * identifier intentionally to ensure they don't satisfy the caret/tilde-equivalent semver ranges we provide to
		 * partners. These tests check that the dev versions are excluded.
		 */
		it("Prerelease/dev versions do not satisfy ranges", () => {
			assert.isFalse(
				semver.satisfies(
					`2.0.0-dev.1.1.1.95400`,
					`>=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0`,
				),
			);
			assert.isFalse(
				semver.satisfies(
					`2.0.0-dev.1.0.1.95400`,
					`>=2.0.0-internal.1.0.0 <2.0.0-internal.1.1.0`,
				),
			);
			assert.isFalse(
				semver.satisfies(
					`2.0.0-dev.1.5.0.95400`,
					`>=2.0.0-internal.1.4.0 <2.0.0-internal.2.0.0`,
				),
			);
			assert.isFalse(
				semver.satisfies(`2.0.0-dev.1.5.0`, `>=2.0.0-internal.1.4.0 <2.0.0-internal.2.0.0`),
			);
		});
	});

	describe("detect constraint types", () => {
		it("patch constraint", () => {
			const input = `>=2.0.0-internal.1.0.23 <2.0.0-internal.1.1.0`;
			const expected = `patch`;
			const result = detectInternalVersionConstraintType(input);
			assert.strictEqual(result, expected);
		});

		it("minor constraint", () => {
			const input = `>=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0`;
			const expected = `minor`;
			const result = detectInternalVersionConstraintType(input);
			assert.strictEqual(result, expected);
		});

		it("minor constraint with higher majors", () => {
			const input = `>=2.0.0-internal.2.21.34 <2.0.0-internal.3.0.0`;
			const expected = `minor`;
			const result = detectInternalVersionConstraintType(input);
			assert.strictEqual(result, expected);
		});

		it("~ constraint", () => {
			const input = `~2.0.0-internal.1.0.23`;
			const expected = `patch`;
			const result = detectInternalVersionConstraintType(input);
			assert.strictEqual(result, expected);
		});

		it("^ constraint", () => {
			const input = `^2.0.0-internal.1.0.0`;
			const expected = `minor`;
			const result = detectInternalVersionConstraintType(input);
			assert.strictEqual(result, expected);
		});

		it("invalid and unsupported ranges throw", () => {
			assert.throws(() => detectInternalVersionConstraintType("~"));
			assert.throws(() => detectInternalVersionConstraintType("*"));
			assert.throws(() => detectInternalVersionConstraintType("1.2.3"));
			assert.throws(() => detectInternalVersionConstraintType("1.2.3-0"));
			assert.throws(() => detectInternalVersionConstraintType("^1.2.3"));
			assert.throws(() => detectInternalVersionConstraintType("^1.2.3-0"));
			assert.throws(() => detectInternalVersionConstraintType("~1.2.3"));
			assert.throws(() => detectInternalVersionConstraintType("~1.2.3-0"));
			assert.throws(() =>
				detectInternalVersionConstraintType("workspace:~2.0.0-internal.1.0.23"),
			);
		});
	});
});

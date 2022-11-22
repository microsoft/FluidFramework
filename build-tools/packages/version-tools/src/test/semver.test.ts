/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "chai";

import {
    bumpRange,
    detectBumpType,
    detectConstraintType,
    getPreviousVersions,
    isPrereleaseVersion,
} from "../semver";

describe("semver", () => {
    describe("detect constraint types", () => {
        it("patch constraint", () => {
            const input = `>=2.0.0-internal.1.0.23 <2.0.0-internal.1.1.0`;
            const expected = `patch`;
            const result = detectConstraintType(input);
            assert.strictEqual(result, expected);
        });

        it("minor constraint", () => {
            const input = `>=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0`;
            const expected = `minor`;
            const result = detectConstraintType(input);
            assert.strictEqual(result, expected);
        });

        it("minor constraint with higher majors", () => {
            const input = `>=2.0.0-internal.2.21.34 <2.0.0-internal.3.0.0`;
            const expected = `minor`;
            const result = detectConstraintType(input);
            assert.strictEqual(result, expected);
        });
    });

    describe("detectBumpType semver", () => {
        it("major", () => {
            assert.equal(detectBumpType("0.0.1", "1.0.0"), "major");
        });

        it("minor", () => {
            assert.equal(detectBumpType("0.0.1", "0.1.0"), "minor");
        });

        it("patch", () => {
            assert.equal(detectBumpType("0.0.1", "0.0.2"), "patch");
        });

        it("premajor", () => {
            assert.equal(detectBumpType("0.0.1-foo", "1.0.0"), "major");
        });

        it("preminor", () => {
            assert.equal(detectBumpType("0.0.1-foo", "0.1.0"), "minor");
        });

        it("prepatch", () => {
            assert.equal(detectBumpType("1.1.1-foo", "1.1.2"), "patch");
        });

        it("prerelease", () => {
            assert.isUndefined(detectBumpType("0.0.1-foo", "0.0.1-foo.bar"));
        });

        it("v1 >= v2 throws", () => {
            assert.throws(() => detectBumpType("0.0.1", "0.0.1"));
            assert.throws(() => detectBumpType("0.0.2", "0.0.1"));
            assert.throws(() => detectBumpType("0.0.1+0", "0.0.1"));
            assert.throws(() => detectBumpType("0.0.1+2", "0.0.1+2"));
            assert.throws(() => detectBumpType("0.0.1+3", "0.0.1+2"));
            assert.throws(() => detectBumpType("0.0.1+2.0", "0.0.1+2"));
            assert.throws(() => detectBumpType("0.0.1+2.a", "0.0.1+2.0"));
        });
    });

    describe("detectBumpType internal version scheme", () => {
        it("major", () => {
            assert.equal(detectBumpType("2.0.0-internal.1.0.0", "2.0.0-internal.2.0.0"), "major");
        });

        it("minor", () => {
            assert.equal(detectBumpType("2.0.0-internal.1.0.0", "2.0.0-internal.1.1.0"), "minor");
        });

        it("patch", () => {
            assert.equal(detectBumpType("2.0.0-internal.1.0.0", "2.0.0-internal.1.0.1"), "patch");
        });

        it("premajor bump type returns major", () => {
            assert.equal(
                detectBumpType("2.0.0-internal.1.0.0.82134", "2.0.0-internal.2.0.0"),
                "major",
            );
        });

        it("preminor bump type returns minor", () => {
            assert.equal(
                detectBumpType("2.0.0-internal.1.1.0.82134", "2.0.0-internal.1.2.0"),
                "minor",
            );
        });

        it("prepatch bump type returns patch", () => {
            assert.equal(detectBumpType("1.1.1-foo", "1.1.2"), "patch");
        });

        it("prerelease bump type returns undefined", () => {
            assert.isUndefined(
                detectBumpType("2.0.0-internal.1.0.0.82134", "2.0.0-internal.1.0.0"),
            );
        });

        it("v1 >= v2 throws", () => {
            assert.throws(() => detectBumpType("0.0.1", "0.0.1"));
            assert.throws(() => detectBumpType("0.0.2", "0.0.1"));
            assert.throws(() => detectBumpType("0.0.1+0", "0.0.1"));
            assert.throws(() => detectBumpType("0.0.1+2", "0.0.1+2"));
            assert.throws(() => detectBumpType("0.0.1+3", "0.0.1+2"));
            assert.throws(() => detectBumpType("0.0.1+2.0", "0.0.1+2"));
            assert.throws(() => detectBumpType("0.0.1+2.a", "0.0.1+2.0"));
        });

        it("invalid semver v1 throws", () => {
            assert.throws(() => detectBumpType("bad semver", "0.0.1"));
        });

        it("invalid semver v2 throws", () => {
            assert.throws(() => detectBumpType("0.0.1", "bad semver"));
        });

        it("v1 is semver, v2 is internal with smaller internal version", () => {
            assert.equal(detectBumpType("1.2.6", "2.0.0-internal.1.0.0"), "major");
        });

        it("v1 is virtualPatch, v2 is internal", () => {
            assert.equal(detectBumpType("0.4.2000", "2.0.0-internal.1.0.0"), "major");
        });

        it("v1 is semver, v2 is internal with larger internal version", () => {
            assert.equal(detectBumpType("1.4.1", "2.0.0-internal.3.0.0"), "major");
        });

        it("v1 is semver, v2 is internal with smaller internal version", () => {
            assert.equal(detectBumpType("1.4.1", "2.0.0-internal.1.1.0"), "major");
        });

        it("v1 is semver, v2 is internal but smaller than v1", () => {
            assert.throws(() => detectBumpType("2.1.0", "2.0.0-internal.3.0.0"));
        });
    });

    describe("internal version scheme ranges", () => {
        it("bump patch", () => {
            const input = `>=2.0.0-internal.1.0.0 <2.0.0-internal.1.1.0`;
            const expected = `>=2.0.0-internal.1.0.1 <2.0.0-internal.1.1.0`;
            const result = bumpRange(input, "patch");
            assert.strictEqual(result, expected);
        });

        it("bump minor", () => {
            const input = `>=2.0.0-internal.1.0.1 <2.0.0-internal.2.0.0`;
            const expected = `>=2.0.0-internal.1.1.0 <2.0.0-internal.2.0.0`;
            const result = bumpRange(input, "minor");
            assert.strictEqual(result, expected);
        });

        it("bump minor with patch constraint", () => {
            const input = `>=2.0.0-internal.1.0.1 <2.0.0-internal.1.1.0`;
            const expected = `>=2.0.0-internal.1.1.0 <2.0.0-internal.1.2.0`;
            const result = bumpRange(input, "minor");
            assert.strictEqual(result, expected);
        });

        it("bump minor with minor constraint", () => {
            const input = `>=2.0.0-internal.1.0.1 <2.0.0-internal.2.0.0`;
            const expected = `>=2.0.0-internal.1.1.0 <2.0.0-internal.2.0.0`;
            const result = bumpRange(input, "minor");
            assert.strictEqual(result, expected);
        });

        it("bump major with patch constraint", () => {
            const input = `>=2.0.0-internal.1.0.1 <2.0.0-internal.1.1.0`;
            const expected = `>=2.0.0-internal.2.0.0 <2.0.0-internal.2.1.0`;
            const result = bumpRange(input, "major");
            assert.strictEqual(result, expected);
        });

        it("bump major with minor constraint", () => {
            const input = `>=2.0.0-internal.1.0.1 <2.0.0-internal.2.0.0`;
            const expected = `>=2.0.0-internal.2.0.0 <2.0.0-internal.3.0.0`;
            const result = bumpRange(input, "major");
            assert.strictEqual(result, expected);
        });
    });

    describe("virtualPatch version scheme ranges", () => {
        describe("precise version", () => {
            it("bump patch", () => {
                const input = `0.1029.1000`;
                const expected = `0.1029.1001`;
                const result = bumpRange(input, "patch");
                assert.strictEqual(result, expected);
            });

            it("bump minor", () => {
                const input = `0.59.1001`;
                const expected = `0.59.2000`;
                const result = bumpRange(input, "minor");
                assert.strictEqual(result, expected);
            });

            it("bump major", () => {
                const input = `0.59.1001`;
                const expected = `0.60.1000`;
                const result = bumpRange(input, "major");
                assert.strictEqual(result, expected);
            });

            it("bump current", () => {
                const input = `0.59.1001`;
                const expected = `0.59.1001`;
                const result = bumpRange(input, "current");
                assert.strictEqual(result, expected);
            });

            it("bump patch prerelease", () => {
                const input = `0.1029.1000`;
                const expected = `0.1029.1001-0`;
                const result = bumpRange(input, "patch", true);
                assert.strictEqual(result, expected);
            });

            it("bump minor prerelease", () => {
                const input = `0.59.1001`;
                const expected = `0.59.2000-0`;
                const result = bumpRange(input, "minor", true);
                assert.strictEqual(result, expected);
            });

            it("bump major prerelease", () => {
                const input = `0.59.1001`;
                const expected = `0.60.1000-0`;
                const result = bumpRange(input, "major", true);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current", () => {
                const input = `0.1029.1000-0`;
                const expected = `0.1029.1000`;
                const result = bumpRange(input, "current", false);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current prerelease (no-op)", () => {
                const input = `0.1029.1000-0`;
                const expected = `0.1029.1000-0`;
                const result = bumpRange(input, "current", true);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current", () => {
                const input = `0.1029.1000-0`;
                const expected = `0.1029.1000`;
                const result = bumpRange(input, "current", false);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current prerelease (no-op)", () => {
                const input = `0.1029.1000-0`;
                const expected = `0.1029.1000-0`;
                const result = bumpRange(input, "current", true);
                assert.strictEqual(result, expected);
            });
        });

        describe("caret", () => {
            it("bump patch", () => {
                const input = `^0.59.1001`;
                const expected = `^0.59.1002`;
                const result = bumpRange(input, "patch");
                assert.strictEqual(result, expected);
            });

            it("bump minor", () => {
                const input = `^0.59.1001`;
                const expected = `^0.59.2000`;
                const result = bumpRange(input, "minor");
                assert.strictEqual(result, expected);
            });

            it("bump major", () => {
                const input = `^0.59.1001`;
                const expected = `^0.60.1000`;
                const result = bumpRange(input, "major");
                assert.strictEqual(result, expected);
            });

            it("bump current", () => {
                const input = `^0.59.1001`;
                const expected = `^0.59.1001`;
                const result = bumpRange(input, "current");
                assert.strictEqual(result, expected);
            });

            it("bump patch prerelease", () => {
                const input = `^0.59.1001`;
                const expected = `^0.59.1002-0`;
                const result = bumpRange(input, "patch", true);
                assert.strictEqual(result, expected);
            });

            it("bump minor prerelease", () => {
                const input = `^0.59.1001`;
                const expected = `^0.59.2000-0`;
                const result = bumpRange(input, "minor", true);
                assert.strictEqual(result, expected);
            });

            it("bump major prerelease", () => {
                const input = `^0.59.1001`;
                const expected = `^0.60.1000-0`;
                const result = bumpRange(input, "major", true);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current", () => {
                const input = `^0.1029.1000-0`;
                const expected = `^0.1029.1000`;
                const result = bumpRange(input, "current", false);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current prerelease (no-op)", () => {
                const input = `^0.1029.1000-0`;
                const expected = `^0.1029.1000-0`;
                const result = bumpRange(input, "current", true);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current", () => {
                const input = `^0.1029.1000-0`;
                const expected = `^0.1029.1000`;
                const result = bumpRange(input, "current", false);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current prerelease (no-op)", () => {
                const input = `^0.1029.1000-0`;
                const expected = `^0.1029.1000-0`;
                const result = bumpRange(input, "current", true);
                assert.strictEqual(result, expected);
            });
        });

        describe("tilde", () => {
            it("bump patch", () => {
                const input = `~0.59.2001`;
                const expected = `~0.59.2002`;
                const result = bumpRange(input, "patch");
                assert.strictEqual(result, expected);
            });

            it("bump minor", () => {
                const input = `~0.59.1234`;
                const expected = `~0.59.2000`;
                const result = bumpRange(input, "minor");
                assert.strictEqual(result, expected);
            });

            it("bump major", () => {
                const input = `~0.59.1234`;
                const expected = `~0.60.1000`;
                const result = bumpRange(input, "major");
                assert.strictEqual(result, expected);
            });

            it("bump current", () => {
                const input = `~0.59.1234`;
                const expected = `~0.59.1234`;
                const result = bumpRange(input, "current");
                assert.strictEqual(result, expected);
            });

            it("bump patch prerelease", () => {
                const input = `~0.59.2001`;
                const expected = `~0.59.2002-0`;
                const result = bumpRange(input, "patch", true);
                assert.strictEqual(result, expected);
            });

            it("bump minor prerelease", () => {
                const input = `~0.59.1234`;
                const expected = `~0.59.2000-0`;
                const result = bumpRange(input, "minor", true);
                assert.strictEqual(result, expected);
            });

            it("bump major prerelease", () => {
                const input = `~0.59.1234`;
                const expected = `~0.60.1000-0`;
                const result = bumpRange(input, "major", true);
                assert.strictEqual(result, expected);
            });

            it("bump current prerelease", () => {
                const input = `~0.59.1234`;
                const expected = `~0.59.1234-0`;
                const result = bumpRange(input, "current", true);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current", () => {
                const input = `~0.1029.1000-0`;
                const expected = `~0.1029.1000`;
                const result = bumpRange(input, "current", false);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current prerelease (no-op)", () => {
                const input = `~0.1029.1000-0`;
                const expected = `~0.1029.1000-0`;
                const result = bumpRange(input, "current", true);
                assert.strictEqual(result, expected);
            });
        });
    });

    describe("semver scheme ranges", () => {
        describe("precise version", () => {
            it("bump patch", () => {
                const input = `2.4.3`;
                const expected = `2.4.4`;
                const result = bumpRange(input, "patch");
                assert.strictEqual(result, expected);
            });

            it("bump minor", () => {
                const input = `2.4.3`;
                const expected = `2.5.0`;
                const result = bumpRange(input, "minor");
                assert.strictEqual(result, expected);
            });

            it("bump major", () => {
                const input = `2.4.3`;
                const expected = `3.0.0`;
                const result = bumpRange(input, "major");
                assert.strictEqual(result, expected);
            });

            it("bump current", () => {
                const input = `2.4.3`;
                const expected = `2.4.3`;
                const result = bumpRange(input, "current");
                assert.strictEqual(result, expected);
            });

            it("bump patch prerelease", () => {
                const input = `2.4.3`;
                const expected = `2.4.4-0`;
                const result = bumpRange(input, "patch", true);
                assert.strictEqual(result, expected);
            });

            it("bump minor prerelease", () => {
                const input = `2.4.3`;
                const expected = `2.5.0-0`;
                const result = bumpRange(input, "minor", true);
                assert.strictEqual(result, expected);
            });

            it("bump major prerelease", () => {
                const input = `2.4.3`;
                const expected = `3.0.0-0`;
                const result = bumpRange(input, "major", true);
                assert.strictEqual(result, expected);
            });

            it("bump current prerelease", () => {
                const input = `2.4.3`;
                const expected = `2.4.3-0`;
                const result = bumpRange(input, "current", true);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current", () => {
                const input = `2.4.3-0`;
                const expected = `2.4.3`;
                const result = bumpRange(input, "current", false);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current prerelease (no-op)", () => {
                const input = `2.4.3-0`;
                const expected = `2.4.3-0`;
                const result = bumpRange(input, "current", true);
                assert.strictEqual(result, expected);
            });
        });

        describe("caret", () => {
            it("bump patch", () => {
                const input = `^2.4.3`;
                const expected = `^2.4.4`;
                const result = bumpRange(input, "patch");
                assert.strictEqual(result, expected);
            });

            it("bump minor", () => {
                const input = `^2.4.3`;
                const expected = `^2.5.0`;
                const result = bumpRange(input, "minor");
                assert.strictEqual(result, expected);
            });

            it("bump major", () => {
                const input = `^2.4.3`;
                const expected = `^3.0.0`;
                const result = bumpRange(input, "major");
                assert.strictEqual(result, expected);
            });

            it("bump current", () => {
                const input = `^2.4.3`;
                const expected = `^2.4.3`;
                const result = bumpRange(input, "current");
                assert.strictEqual(result, expected);
            });

            it("bump patch prerelease", () => {
                const input = `^2.4.3`;
                const expected = `^2.4.4-0`;
                const result = bumpRange(input, "patch", true);
                assert.strictEqual(result, expected);
            });

            it("bump minor prerelease", () => {
                const input = `^2.4.3`;
                const expected = `^2.5.0-0`;
                const result = bumpRange(input, "minor", true);
                assert.strictEqual(result, expected);
            });

            it("bump major prerelease", () => {
                const input = `^2.4.3`;
                const expected = `^3.0.0-0`;
                const result = bumpRange(input, "major", true);
                assert.strictEqual(result, expected);
            });

            it("bump current prerelease", () => {
                const input = `^2.4.3`;
                const expected = `^2.4.3-0`;
                const result = bumpRange(input, "current", true);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current", () => {
                const input = `^2.4.3-0`;
                const expected = `^2.4.3`;
                const result = bumpRange(input, "current", false);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current prerelease (no-op)", () => {
                const input = `^2.4.3-0`;
                const expected = `^2.4.3-0`;
                const result = bumpRange(input, "current", true);
                assert.strictEqual(result, expected);
            });
        });

        describe("tilde", () => {
            it("bump patch", () => {
                const input = `~2.4.3`;
                const expected = `~2.4.4`;
                const result = bumpRange(input, "patch");
                assert.strictEqual(result, expected);
            });

            it("bump minor", () => {
                const input = `~2.4.3`;
                const expected = `~2.5.0`;
                const result = bumpRange(input, "minor");
                assert.strictEqual(result, expected);
            });

            it("bump major", () => {
                const input = `~2.4.3`;
                const expected = `~3.0.0`;
                const result = bumpRange(input, "major");
                assert.strictEqual(result, expected);
            });

            it("bump patch prerelease", () => {
                const input = `~2.4.3`;
                const expected = `~2.4.4-0`;
                const result = bumpRange(input, "patch", true);
                assert.strictEqual(result, expected);
            });

            it("bump minor prerelease", () => {
                const input = `~2.4.3`;
                const expected = `~2.5.0-0`;
                const result = bumpRange(input, "minor", true);
                assert.strictEqual(result, expected);
            });

            it("bump major prerelease", () => {
                const input = `~2.4.3`;
                const expected = `~3.0.0-0`;
                const result = bumpRange(input, "major", true);
                assert.strictEqual(result, expected);
            });

            it("bump current prerelease", () => {
                const input = `~2.4.3`;
                const expected = `~2.4.3-0`;
                const result = bumpRange(input, "current", true);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current", () => {
                const input = `~2.4.3-0`;
                const expected = `~2.4.3`;
                const result = bumpRange(input, "current", false);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current prerelease (no-op)", () => {
                const input = `~2.4.3-0`;
                const expected = `~2.4.3-0`;
                const result = bumpRange(input, "current", true);
                assert.strictEqual(result, expected);
            });
        });
    });

    describe("isPrereleaseVersion", () => {
        it("1.2.3 = false", () => {
            const input = `1.2.3`;
            const result = isPrereleaseVersion(input);
            assert.isFalse(result);
        });

        it("1.2.3-2345 = true", () => {
            const input = `1.2.3-2345`;
            const result = isPrereleaseVersion(input);
            assert.isTrue(result);
        });

        it("0.4.2001 = false", () => {
            const input = `0.4.2001`;
            const result = isPrereleaseVersion(input);
            assert.isFalse(result);
        });

        it("0.4.2001-2345 = true", () => {
            const input = `0.4.2001-2345`;
            const result = isPrereleaseVersion(input);
            assert.isTrue(result);
        });

        it("2.0.0-internal.1.0.0 = false", () => {
            const input = `2.0.0-internal.1.0.0`;
            const result = isPrereleaseVersion(input);
            assert.isFalse(result);
        });

        it("2.0.0-internal.1.0.0.2345 = true", () => {
            const input = `2.0.0-internal.1.0.0.2345`;
            const result = isPrereleaseVersion(input);
            assert.isTrue(result);
        });
    });

    describe("getPreviousVersions", () => {
        it("1.3.3", () => {
            const input = `1.3.3`;
            const [expected1, expected2] = [`1.0.0`, `1.2.0`];
            const [result1, result2] = getPreviousVersions(input);
            assert.equal(result1, expected1, "previous major version mismatch");
            assert.equal(result2, expected2, "previous minor version mismatch");
        });

        it("2.0.0", () => {
            const input = `2.0.0`;
            const [expected1, expected2] = [`1.0.0`, `2.0.0`];
            const [result1, result2] = getPreviousVersions(input);
            assert.equal(result1, expected1, "previous major version mismatch");
            assert.equal(result2, expected2, "previous minor version mismatch");
        });

        it("4.5.12", () => {
            const input = `4.5.12`;
            const [expected1, expected2] = [`3.0.0`, `4.4.0`];
            const [result1, result2] = getPreviousVersions(input);
            assert.equal(result1, expected1, "previous major version mismatch");
            assert.equal(result2, expected2, "previous minor version mismatch");
        });

        it("0.4.1000", () => {
            const input = `0.4.1000`;
            const [expected1, expected2] = [`0.3.1000`, `0.4.1000`];
            const [result1, result2] = getPreviousVersions(input);
            assert.equal(result1, expected1, "previous major version mismatch");
            assert.equal(result2, expected2, "previous minor version mismatch");
        });

        it("0.4.2000", () => {
            const input = `0.4.1000`;
            const [expected1, expected2] = [`0.3.1000`, `0.4.1000`];
            const [result1, result2] = getPreviousVersions(input);
            assert.equal(result1, expected1, "previous major version mismatch");
            assert.equal(result2, expected2, "previous minor version mismatch");
        });

        it("0.59.3000", () => {
            const input = `0.59.3000`;
            const [expected1, expected2] = [`0.58.1000`, `0.59.2000`];
            const [result1, result2] = getPreviousVersions(input);
            assert.equal(result1, expected1, "previous major version mismatch");
            assert.equal(result2, expected2, "previous minor version mismatch");
        });

        it("2.0.0-internal.1.0.0", () => {
            const input = `2.0.0-internal.1.0.0`;
            const [expected1, expected2] = [`1.0.0`, `2.0.0-internal.1.0.0`];
            const [result1, result2] = getPreviousVersions(input);
            assert.equal(result1, expected1, "previous major version mismatch");
            assert.equal(result2, expected2, "previous minor version mismatch");
        });

        it("2.0.0-internal.1.1.0", () => {
            const input = `2.0.0-internal.1.1.0`;
            const [expected1, expected2] = [`1.0.0`, `2.0.0-internal.1.0.0`];
            const [result1, result2] = getPreviousVersions(input);
            assert.equal(result1, expected1, "previous major version mismatch");
            assert.equal(result2, expected2, "previous minor version mismatch");
        });

        it("2.0.0-internal.1.3.0", () => {
            const input = `2.0.0-internal.1.3.0`;
            const [expected1, expected2] = [`1.0.0`, `2.0.0-internal.1.2.0`];
            const [result1, result2] = getPreviousVersions(input);
            assert.equal(result1, expected1, "previous major version mismatch");
            assert.equal(result2, expected2, "previous minor version mismatch");
        });

        it("2.0.0-internal.2.0.0", () => {
            const input = `2.0.0-internal.2.0.0`;
            const [expected1, expected2] = [`2.0.0-internal.1.0.0`, `2.0.0-internal.2.0.0`];
            const [result1, result2] = getPreviousVersions(input);
            assert.equal(result1, expected1, "previous major version mismatch");
            assert.equal(result2, expected2, "previous minor version mismatch");
        });

        it("2.0.0-internal.2.2.0", () => {
            const input = `2.0.0-internal.2.2.0`;
            const [expected1, expected2] = [`2.0.0-internal.1.0.0`, `2.0.0-internal.2.1.0`];
            const [result1, result2] = getPreviousVersions(input);
            assert.equal(result1, expected1, "previous major version mismatch");
            assert.equal(result2, expected2, "previous minor version mismatch");
        });

        it("2.0.0-internal.3.0.0", () => {
            const input = `2.0.0-internal.3.0.0`;
            const [expected1, expected2] = [`2.0.0-internal.2.0.0`, `2.0.0-internal.3.0.0`];
            const [result1, result2] = getPreviousVersions(input);
            assert.equal(result1, expected1, "previous major version mismatch");
            assert.equal(result2, expected2, "previous minor version mismatch");
        });

        it("2.0.0-internal.3.2.0", () => {
            const input = `2.0.0-internal.3.2.0`;
            const [expected1, expected2] = [`2.0.0-internal.2.0.0`, `2.0.0-internal.3.1.0`];
            const [result1, result2] = getPreviousVersions(input);
            assert.equal(result1, expected1, "previous major version mismatch");
            assert.equal(result2, expected2, "previous minor version mismatch");
        });

        it("2.0.0-internal.3.2.2", () => {
            const input = `2.0.0-internal.3.2.2`;
            const [expected1, expected2] = [`2.0.0-internal.2.0.0`, `2.0.0-internal.3.1.0`];
            const [result1, result2] = getPreviousVersions(input);
            assert.equal(result1, expected1, "previous major version mismatch");
            assert.equal(result2, expected2, "previous minor version mismatch");
        });

        it("3.0.0-internal.3.2.2", () => {
            const input = `3.0.0-internal.3.2.2`;
            const [expected1, expected2] = [`3.0.0-internal.2.0.0`, `3.0.0-internal.3.1.0`];
            const [result1, result2] = getPreviousVersions(input);
            assert.equal(result1, expected1, "previous major version mismatch");
            assert.equal(result2, expected2, "previous minor version mismatch");
        });
    });
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */

import { assert } from "chai";
import {
    detectConstraintType,
    bumpRange,
    detectBumpType,
    isPrereleaseVersion,
} from "../src/semver";

describe("semver", () => {
    describe("detect constraint types", () => {
        it("patch constraint", () => {
            const input = `>=2.0.0-internal.1.0.23 <2.0.0-internal.1.1.0`;
            // const input = ">=2.0.0-internal.1.0.1 <2.0.0-internal.1.2.0";
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

    describe("semverDiff", () => {
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
});

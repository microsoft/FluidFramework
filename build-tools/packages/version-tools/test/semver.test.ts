/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */

import { assert } from "chai";
import { detectConstraintType, incRange } from "../src/semver";

describe("semver", () => {
    describe("internal version scheme ranges", () => {
        it("patch bump", () => {
            const input = `>=2.0.0-internal.1.0.0 <2.0.0-internal.1.1.0`;
            const expected = `>=2.0.0-internal.1.0.1 <2.0.0-internal.1.1.0`;
            const result = incRange(input, "patch");
            assert.strictEqual(result, expected);
        });

        it("bump minor", () => {
            const input = `>=2.0.0-internal.1.0.1 <2.0.0-internal.2.0.0`;
            const expected = `>=2.0.0-internal.1.1.0 <2.0.0-internal.2.0.0`;
            const result = incRange(input, "minor");
            assert.strictEqual(result, expected);
        });

        it("bump minor with patch constraint", () => {
            const input = `>=2.0.0-internal.1.0.1 <2.0.0-internal.1.1.0`;
            const expected = `>=2.0.0-internal.1.1.0 <2.0.0-internal.1.2.0`;
            const result = incRange(input, "minor");
            assert.strictEqual(result, expected);
        });

        it("bump minor with minor constraint", () => {
            const input = `>=2.0.0-internal.1.0.1 <2.0.0-internal.2.0.0`;
            const expected = `>=2.0.0-internal.1.1.0 <2.0.0-internal.2.0.0`;
            const result = incRange(input, "minor");
            assert.strictEqual(result, expected);
        });

        it("bump major with patch constraint", () => {
            const input = `>=2.0.0-internal.1.0.1 <2.0.0-internal.1.1.0`;
            const expected = `>=2.0.0-internal.2.0.0 <2.0.0-internal.2.1.0`;
            const result = incRange(input, "major");
            assert.strictEqual(result, expected);
        });

        it("bump major with minor constraint", () => {
            const input = `>=2.0.0-internal.1.0.1 <2.0.0-internal.2.0.0`;
            const expected = `>=2.0.0-internal.2.0.0 <2.0.0-internal.3.0.0`;
            const result = incRange(input, "major");
            assert.strictEqual(result, expected);
        });
    });

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

    describe("internal version scheme ranges", () => {
        it("bump patch", () => {
            const input = `>=2.0.0-internal.1.0.0 <2.0.0-internal.1.1.0`;
            const expected = `>=2.0.0-internal.1.0.1 <2.0.0-internal.1.1.0`;
            const result = incRange(input, "patch");
            assert.strictEqual(result, expected);
        });

        it("bump minor", () => {
            const input = `>=2.0.0-internal.1.0.1 <2.0.0-internal.2.0.0`;
            const expected = `>=2.0.0-internal.1.1.0 <2.0.0-internal.2.0.0`;
            const result = incRange(input, "minor");
            assert.strictEqual(result, expected);
        });

        it("bump minor with patch constraint", () => {
            const input = `>=2.0.0-internal.1.0.1 <2.0.0-internal.1.1.0`;
            const expected = `>=2.0.0-internal.1.1.0 <2.0.0-internal.1.2.0`;
            const result = incRange(input, "minor");
            assert.strictEqual(result, expected);
        });

        it("bump minor with minor constraint", () => {
            const input = `>=2.0.0-internal.1.0.1 <2.0.0-internal.2.0.0`;
            const expected = `>=2.0.0-internal.1.1.0 <2.0.0-internal.2.0.0`;
            const result = incRange(input, "minor");
            assert.strictEqual(result, expected);
        });

        it("bump major with patch constraint", () => {
            const input = `>=2.0.0-internal.1.0.1 <2.0.0-internal.1.1.0`;
            const expected = `>=2.0.0-internal.2.0.0 <2.0.0-internal.2.1.0`;
            const result = incRange(input, "major");
            assert.strictEqual(result, expected);
        });

        it("bump major with minor constraint", () => {
            const input = `>=2.0.0-internal.1.0.1 <2.0.0-internal.2.0.0`;
            const expected = `>=2.0.0-internal.2.0.0 <2.0.0-internal.3.0.0`;
            const result = incRange(input, "major");
            assert.strictEqual(result, expected);
        });
    });

    describe("virtualPatch version scheme ranges", () => {
        describe("precise version", () => {
            it("bump patch", () => {
                const input = `0.1029.1000`;
                const expected = `0.1029.1001`;
                const result = incRange(input, "patch");
                assert.strictEqual(result, expected);
            });

            it("bump minor", () => {
                const input = `0.59.1001`;
                const expected = `0.59.2000`;
                const result = incRange(input, "minor");
                assert.strictEqual(result, expected);
            });

            it("bump major", () => {
                const input = `0.59.1001`;
                const expected = `0.60.1000`;
                const result = incRange(input, "major");
                assert.strictEqual(result, expected);
            });

            it("bump current", () => {
                const input = `0.59.1001`;
                const expected = `0.59.1001`;
                const result = incRange(input, "current");
                assert.strictEqual(result, expected);
            });

            it("bump patch prerelease", () => {
                const input = `0.1029.1000`;
                const expected = `0.1029.1001-0`;
                const result = incRange(input, "patch", true);
                assert.strictEqual(result, expected);
            });

            it("bump minor prerelease", () => {
                const input = `0.59.1001`;
                const expected = `0.59.2000-0`;
                const result = incRange(input, "minor", true);
                assert.strictEqual(result, expected);
            });

            it("bump major prerelease", () => {
                const input = `0.59.1001`;
                const expected = `0.60.1000-0`;
                const result = incRange(input, "major", true);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current", () => {
                const input = `0.1029.1000-0`;
                const expected = `0.1029.1000`;
                const result = incRange(input, "current", false);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current prerelease (no-op)", () => {
                const input = `0.1029.1000-0`;
                const expected = `0.1029.1000-0`;
                const result = incRange(input, "current", true);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current", () => {
                const input = `0.1029.1000-0`;
                const expected = `0.1029.1000`;
                const result = incRange(input, "current", false);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current prerelease (no-op)", () => {
                const input = `0.1029.1000-0`;
                const expected = `0.1029.1000-0`;
                const result = incRange(input, "current", true);
                assert.strictEqual(result, expected);
            });
        });

        describe("caret", () => {
            it("bump patch", () => {
                const input = `^0.59.1001`;
                const expected = `^0.59.1002`;
                const result = incRange(input, "patch");
                assert.strictEqual(result, expected);
            });

            it("bump minor", () => {
                const input = `^0.59.1001`;
                const expected = `^0.59.2000`;
                const result = incRange(input, "minor");
                assert.strictEqual(result, expected);
            });

            it("bump major", () => {
                const input = `^0.59.1001`;
                const expected = `^0.60.1000`;
                const result = incRange(input, "major");
                assert.strictEqual(result, expected);
            });

            it("bump current", () => {
                const input = `^0.59.1001`;
                const expected = `^0.59.1001`;
                const result = incRange(input, "current");
                assert.strictEqual(result, expected);
            });

            it("bump patch prerelease", () => {
                const input = `^0.59.1001`;
                const expected = `^0.59.1002-0`;
                const result = incRange(input, "patch", true);
                assert.strictEqual(result, expected);
            });

            it("bump minor prerelease", () => {
                const input = `^0.59.1001`;
                const expected = `^0.59.2000-0`;
                const result = incRange(input, "minor", true);
                assert.strictEqual(result, expected);
            });

            it("bump major prerelease", () => {
                const input = `^0.59.1001`;
                const expected = `^0.60.1000-0`;
                const result = incRange(input, "major", true);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current", () => {
                const input = `^0.1029.1000-0`;
                const expected = `^0.1029.1000`;
                const result = incRange(input, "current", false);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current prerelease (no-op)", () => {
                const input = `^0.1029.1000-0`;
                const expected = `^0.1029.1000-0`;
                const result = incRange(input, "current", true);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current", () => {
                const input = `^0.1029.1000-0`;
                const expected = `^0.1029.1000`;
                const result = incRange(input, "current", false);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current prerelease (no-op)", () => {
                const input = `^0.1029.1000-0`;
                const expected = `^0.1029.1000-0`;
                const result = incRange(input, "current", true);
                assert.strictEqual(result, expected);
            });
        });

        describe("tilde", () => {
            it("bump patch", () => {
                const input = `~0.59.2001`;
                const expected = `~0.59.2002`;
                const result = incRange(input, "patch");
                assert.strictEqual(result, expected);
            });

            it("bump minor", () => {
                const input = `~0.59.1234`;
                const expected = `~0.59.2000`;
                const result = incRange(input, "minor");
                assert.strictEqual(result, expected);
            });

            it("bump major", () => {
                const input = `~0.59.1234`;
                const expected = `~0.60.1000`;
                const result = incRange(input, "major");
                assert.strictEqual(result, expected);
            });

            it("bump current", () => {
                const input = `~0.59.1234`;
                const expected = `~0.59.1234`;
                const result = incRange(input, "current");
                assert.strictEqual(result, expected);
            });

            it("bump patch prerelease", () => {
                const input = `~0.59.2001`;
                const expected = `~0.59.2002-0`;
                const result = incRange(input, "patch", true);
                assert.strictEqual(result, expected);
            });

            it("bump minor prerelease", () => {
                const input = `~0.59.1234`;
                const expected = `~0.59.2000-0`;
                const result = incRange(input, "minor", true);
                assert.strictEqual(result, expected);
            });

            it("bump major prerelease", () => {
                const input = `~0.59.1234`;
                const expected = `~0.60.1000-0`;
                const result = incRange(input, "major", true);
                assert.strictEqual(result, expected);
            });

            it("bump current prerelease", () => {
                const input = `~0.59.1234`;
                const expected = `~0.59.1234-0`;
                const result = incRange(input, "current", true);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current", () => {
                const input = `~0.1029.1000-0`;
                const expected = `~0.1029.1000`;
                const result = incRange(input, "current", false);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current prerelease (no-op)", () => {
                const input = `~0.1029.1000-0`;
                const expected = `~0.1029.1000-0`;
                const result = incRange(input, "current", true);
                assert.strictEqual(result, expected);
            });
        });
    });

    describe("semver scheme ranges", () => {
        describe("precise version", () => {
            it("bump patch", () => {
                const input = `2.4.3`;
                const expected = `2.4.4`;
                const result = incRange(input, "patch");
                assert.strictEqual(result, expected);
            });

            it("bump minor", () => {
                const input = `2.4.3`;
                const expected = `2.5.0`;
                const result = incRange(input, "minor");
                assert.strictEqual(result, expected);
            });

            it("bump major", () => {
                const input = `2.4.3`;
                const expected = `3.0.0`;
                const result = incRange(input, "major");
                assert.strictEqual(result, expected);
            });

            it("bump current", () => {
                const input = `2.4.3`;
                const expected = `2.4.3`;
                const result = incRange(input, "current");
                assert.strictEqual(result, expected);
            });

            it("bump patch prerelease", () => {
                const input = `2.4.3`;
                const expected = `2.4.4-0`;
                const result = incRange(input, "patch", true);
                assert.strictEqual(result, expected);
            });

            it("bump minor prerelease", () => {
                const input = `2.4.3`;
                const expected = `2.5.0-0`;
                const result = incRange(input, "minor", true);
                assert.strictEqual(result, expected);
            });

            it("bump major prerelease", () => {
                const input = `2.4.3`;
                const expected = `3.0.0-0`;
                const result = incRange(input, "major", true);
                assert.strictEqual(result, expected);
            });

            it("bump current prerelease", () => {
                const input = `2.4.3`;
                const expected = `2.4.3-0`;
                const result = incRange(input, "current", true);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current", () => {
                const input = `2.4.3-0`;
                const expected = `2.4.3`;
                const result = incRange(input, "current", false);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current prerelease (no-op)", () => {
                const input = `2.4.3-0`;
                const expected = `2.4.3-0`;
                const result = incRange(input, "current", true);
                assert.strictEqual(result, expected);
            });
        });

        describe("caret", () => {
            it("bump patch", () => {
                const input = `^2.4.3`;
                const expected = `^2.4.4`;
                const result = incRange(input, "patch");
                assert.strictEqual(result, expected);
            });

            it("bump minor", () => {
                const input = `^2.4.3`;
                const expected = `^2.5.0`;
                const result = incRange(input, "minor");
                assert.strictEqual(result, expected);
            });

            it("bump major", () => {
                const input = `^2.4.3`;
                const expected = `^3.0.0`;
                const result = incRange(input, "major");
                assert.strictEqual(result, expected);
            });

            it("bump current", () => {
                const input = `^2.4.3`;
                const expected = `^2.4.3`;
                const result = incRange(input, "current");
                assert.strictEqual(result, expected);
            });

            it("bump patch prerelease", () => {
                const input = `^2.4.3`;
                const expected = `^2.4.4-0`;
                const result = incRange(input, "patch", true);
                assert.strictEqual(result, expected);
            });

            it("bump minor prerelease", () => {
                const input = `^2.4.3`;
                const expected = `^2.5.0-0`;
                const result = incRange(input, "minor", true);
                assert.strictEqual(result, expected);
            });

            it("bump major prerelease", () => {
                const input = `^2.4.3`;
                const expected = `^3.0.0-0`;
                const result = incRange(input, "major", true);
                assert.strictEqual(result, expected);
            });

            it("bump current prerelease", () => {
                const input = `^2.4.3`;
                const expected = `^2.4.3-0`;
                const result = incRange(input, "current", true);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current", () => {
                const input = `^2.4.3-0`;
                const expected = `^2.4.3`;
                const result = incRange(input, "current", false);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current prerelease (no-op)", () => {
                const input = `^2.4.3-0`;
                const expected = `^2.4.3-0`;
                const result = incRange(input, "current", true);
                assert.strictEqual(result, expected);
            });
        });

        describe("tilde", () => {
            it("bump patch", () => {
                const input = `~2.4.3`;
                const expected = `~2.4.4`;
                const result = incRange(input, "patch");
                assert.strictEqual(result, expected);
            });

            it("bump minor", () => {
                const input = `~2.4.3`;
                const expected = `~2.5.0`;
                const result = incRange(input, "minor");
                assert.strictEqual(result, expected);
            });

            it("bump major", () => {
                const input = `~2.4.3`;
                const expected = `~3.0.0`;
                const result = incRange(input, "major");
                assert.strictEqual(result, expected);
            });

            it("bump patch prerelease", () => {
                const input = `~2.4.3`;
                const expected = `~2.4.4-0`;
                const result = incRange(input, "patch", true);
                assert.strictEqual(result, expected);
            });

            it("bump minor prerelease", () => {
                const input = `~2.4.3`;
                const expected = `~2.5.0-0`;
                const result = incRange(input, "minor", true);
                assert.strictEqual(result, expected);
            });

            it("bump major prerelease", () => {
                const input = `~2.4.3`;
                const expected = `~3.0.0-0`;
                const result = incRange(input, "major", true);
                assert.strictEqual(result, expected);
            });

            it("bump current prerelease", () => {
                const input = `~2.4.3`;
                const expected = `~2.4.3-0`;
                const result = incRange(input, "current", true);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current", () => {
                const input = `~2.4.3-0`;
                const expected = `~2.4.3`;
                const result = incRange(input, "current", false);
                assert.strictEqual(result, expected);
            });

            it("bump prerelease to current prerelease (no-op)", () => {
                const input = `~2.4.3-0`;
                const expected = `~2.4.3-0`;
                const result = incRange(input, "current", true);
                assert.strictEqual(result, expected);
            });
        });
    });
});

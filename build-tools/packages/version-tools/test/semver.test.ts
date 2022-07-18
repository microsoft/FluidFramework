/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */

import { assert } from "chai";
import { detectConstraintType, incRange } from "../src/semver";

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

    describe("internal version scheme ranges", () => {
        it("patch bump", () => {
            const input = `>=2.0.0-internal.1.0.0 <2.0.0-internal.1.1.0`;
            const expected = `>=2.0.0-internal.1.0.1 <2.0.0-internal.1.1.0`;
            const result = incRange(input, "patch");
            assert.strictEqual(result, expected);
        });

        it("minor bump", () => {
            const input = `>=2.0.0-internal.1.0.1 <2.0.0-internal.2.0.0`;
            const expected = `>=2.0.0-internal.1.1.0 <2.0.0-internal.2.0.0`;
            const result = incRange(input, "minor");
            assert.strictEqual(result, expected);
        });

        it("minor bump with patch constraint", () => {
            const input = `>=2.0.0-internal.1.0.1 <2.0.0-internal.1.1.0`;
            const expected = `>=2.0.0-internal.1.1.0 <2.0.0-internal.1.2.0`;
            const result = incRange(input, "minor");
            assert.strictEqual(result, expected);
        });
    });

    describe("virtualPatch version scheme ranges", () => {
        it("precise version bump patch", () => {
            const input = `0.1029.1000`;
            const expected = `0.1029.1001`;
            const result = incRange(input, "patch");
            assert.strictEqual(result, expected);
        });

        it("precise version bump minor", () => {
            const input = `0.59.1001`;
            const expected = `0.59.2000`;
            const result = incRange(input, "minor");
            assert.strictEqual(result, expected);
        });

        it("caret bump patch", () => {
            const input = `^0.59.1001`;
            const expected = `^0.59.1002`;
            const result = incRange(input, "patch");
            assert.strictEqual(result, expected);
        });

        it("caret bump minor", () => {
            const input = `^0.59.1001`;
            const expected = `^0.59.2000`;
            const result = incRange(input, "minor");
            assert.strictEqual(result, expected);
        });

        it("tilde bump patch", () => {
            const input = `~0.59.2001`;
            const expected = `~0.59.2002`;
            const result = incRange(input, "patch");
            assert.strictEqual(result, expected);
        });

        it("tilde bump minor", () => {
            const input = `~0.59.1234`;
            const expected = `~0.59.2000`;
            const result = incRange(input, "minor");
            assert.strictEqual(result, expected);
        });
    });

    describe("semver scheme ranges", () => {
        it("precise version bump patch", () => {
            const input = `2.4.3`;
            const expected = `2.4.4`;
            const result = incRange(input, "patch");
            assert.strictEqual(result, expected);
        });

        it("precise version bump minor", () => {
            const input = `2.4.3`;
            const expected = `2.5.0`;
            const result = incRange(input, "minor");
            assert.strictEqual(result, expected);
        });

        it("caret bump patch", () => {
            const input = `^2.4.3`;
            const expected = `^2.4.4`;
            const result = incRange(input, "patch");
            assert.strictEqual(result, expected);
        });

        it("caret bump minor", () => {
            const input = `^2.4.3`;
            const expected = `^2.5.0`;
            const result = incRange(input, "minor");
            assert.strictEqual(result, expected);
        });

        it("tilde bump patch", () => {
            const input = `~2.4.3`;
            const expected = `~2.4.4`;
            const result = incRange(input, "patch");
            assert.strictEqual(result, expected);
        });

        it("tilde bump minor", () => {
            const input = `~2.4.3`;
            const expected = `~2.5.0`;
            const result = incRange(input, "minor");
            assert.strictEqual(result, expected);
        });
    });
});

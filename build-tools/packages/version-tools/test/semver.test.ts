/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */

import { assert } from "chai";
import {
    detectConstraintType,
    incRange,
} from "../src/semver";

describe("semver", () => {
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
});

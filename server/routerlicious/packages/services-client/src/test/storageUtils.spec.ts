/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { buildTreePath } from "../storageUtils";

describe("Storage Utils", () => {
    describe("buildTreePath()", () => {
        it("trims leading slashes", () => {
            assert.strictEqual(
                buildTreePath("ABC", ".app", "/.handle"),
                "ABC/.app/.handle",
            );
        });

        it("trims trailing slashes", () => {
            assert.strictEqual(
                buildTreePath("ABC", ".app/", ".handle"),
                "ABC/.app/.handle",
            );
        });

        it("removes blank nodes", () => {
            assert.strictEqual(
                buildTreePath("ABC", ".app", "", ".handle"),
                "ABC/.app/.handle",
            );
        });

        it("does not trim internal slashes", () => {
            assert.strictEqual(
                buildTreePath("ABC", ".app/", ".handle/component/"),
                "ABC/.app/.handle/component",
            );
        });
    });
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { run } from "good-fences";

// Since it's non-trivial to add good-fences to build or link due to fluid-build,
// run it as a test.

describe("good-fences", () => {
    it("good-fences", async () => {
        const result = await run({});
        assert.deepEqual(result, { errors: [], warnings: [] });
    });
});

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import "mocha";
import { strict as assert } from "assert";
import { LogCache } from "../src/cache";

describe("LogCache", () => {
    let cache: LogCache<any>;

    beforeEach(async () => {
        cache = new LogCache();
    });

    it("works", () => {
        for (let i = 0; i < (256 * 256 * 256); i++) {
            cache.append(i);
            assert.equal(cache.length, i + 1);
        }

        cache.forEach((value, index) => {
            assert.equal(value, index);
        });
    });
});

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import "mocha";
import { strict as assert } from "assert";
import { LogIndex } from "../src/cache";

describe("LogIndex", () => {
    let index: LogIndex<any>;

    beforeEach(async () => {
        index = new LogIndex();
    });

    it("works", () => {
        for (let i = 0; i < (256 * 256 * 256); i++) {
            index.append(i);
        }

        index.forEach((value, index) => {
            assert.equal(value, index);
        });
    });
});

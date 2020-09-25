/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Collection } from "../services/inMemorycollection";

describe("Tinylicious", () => {
    describe("Services", () => {
        describe("inMemoryCollection", () => {
            it("findAll - empty", async () => {
                const c = new Collection();
                assert.deepStrictEqual(await c.findAll(), []);
            });

            it("findAll - nonempty", async () => {
                const c = new Collection();
                const obj = { _id: 1, foo: "FOO" };
                await c.insertOne(obj);
                assert.deepStrictEqual(await c.findAll(), [ obj ]);
            });
        });
    });
});

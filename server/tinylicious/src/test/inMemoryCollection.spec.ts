/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Collection } from "../services/inMemorycollection";

describe("Tinylicious", () => {
    describe("Services", () => {
        describe("inMemoryCollection", () => {
            describe("find API", () => {
                it("findAll - empty", async () => {
                    const c = new Collection();
                    assert.deepStrictEqual(await c.findAll(), []);
                });

                it("findAll - nonempty", async () => {
                    const c = new Collection();
                    const obj1 = { _id: 1, foo: "FOO" };
                    const obj2 = { _id: 2, foo: "FOO" };
                    await c.insertOne(obj1);
                    await c.insertOne(obj2);
                    assert.deepStrictEqual(await c.findAll(), [ obj1, obj2 ]);
                });

                it("find/findOne - missing", async () => {
                    const c = new Collection();
                    const obj = { _id: 1, foo: "FOO" };
                    await c.insertOne(obj);
                    assert.deepStrictEqual(await c.find({ a: 2 }), []);
                    assert.deepStrictEqual(await c.findOne({ _id: 2 }), null);
                });

                it("findOne - _id present", async () => {
                    const c = new Collection();
                    const obj = { _id: 1, foo: "FOO" };
                    await c.insertOne(obj);
                    assert.deepStrictEqual(await c.findOne({ _id: 1 }), obj);
                });

                it("find/findOne - using getValueByKey", async () => {
                    const c = new Collection();
                    const obj = { a: { b: 5 } };
                    await c.insertOne(obj);
                    assert.deepStrictEqual(await c.find({ "a.b": 5 }), [ obj ]);
                    assert.deepStrictEqual(await c.find({ "a.b": { $gt: 4 } }), [ obj ]);
                    assert.deepStrictEqual(await c.find({ "a.b": { $lt: 6 } }), [ obj ]);
                    assert.deepStrictEqual(await c.findOne({ "a.b": 5 }), obj);
                    assert.deepStrictEqual(await c.findOne({ "a.b": { $gt: 4 } }), obj);
                    assert.deepStrictEqual(await c.findOne({ "a.b": { $lt: 6 } }), obj);
                });

                it("find/findOne - multiple matches", async () => {
                    const c = new Collection();
                    const obj15 = { a: { b: 15 } };
                    const obj10 = { a: { b: 10 } };
                    await c.insertOne(obj15);
                    await c.insertOne(obj10);
                    assert.deepStrictEqual(await c.find({ "a.b": { $gt: 4 } }), [ obj15, obj10 ]);
                    assert.deepStrictEqual(await c.findOne({ "a.b": { $gt: 4 } }), obj15);
                });

                it("find - with sort", async () => {
                    const c = new Collection();
                    const obj15 = { a: { b: 15 } };
                    const obj10 = { a: { b: 10 } };
                    await c.insertOne(obj15);
                    await c.insertOne(obj10);
                    assert.deepStrictEqual(
                        await c.find({ "a.b": { $gt: 4 } }, { "a.b": 1 }),
                        [ obj10, obj15 ],
                    );
                    assert.deepStrictEqual(
                        await c.find({ "a.b": { $gt: 4 } }, { "a.b": -1 }),
                        [ obj15, obj10 ],
                    );
                });
            });
        });
    });
});

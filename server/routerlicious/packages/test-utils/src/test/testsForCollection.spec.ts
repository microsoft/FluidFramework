/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { TestCollection } from "../testCollection";

describe("Test for TestUtils", () => {
    describe("Collection", () => {
        const item1 = { _id: 1, value: "one", group: "odd" };
        const item2 = { _id: 2, value: "two", group: "even" };
        const item3 = { _id: 3, value: "three", group: "odd" };
        const items = [item1, item2, item3];
        it("finds multiple queried elements", async () => {
            const testCollection = new TestCollection([...items]);
            const expected = [item1, item3];
            const found = await testCollection.find({ group: "odd" }, "_id");
            assert.deepStrictEqual(found, expected);
        });
        it("finds one queried element", async () => {
            const testCollection = new TestCollection([...items]);
            const expected = [item2];
            const found = await testCollection.find({ group: "even" }, "_id");
            assert.deepStrictEqual(found, expected);
        });
        it("finds all elements", async () => {
            const testCollection = new TestCollection([...items]);
            const expected = items;
            const found = await testCollection.findAll();
            assert.deepStrictEqual(found, expected);
        });
        it("finds one element", async () => {
            const testCollection = new TestCollection([...items]);
            const expected = item1;
            const found = await testCollection.findOne({ _id: 1 });
            assert.deepStrictEqual(found, expected);
        });
        it("finds one element when multiple match", async () => {
            const testCollection = new TestCollection([...items]);
            const expected = item1;
            const found = await testCollection.findOne({ group: "odd" });
            assert.deepStrictEqual(found, expected);
        });
        it("finds, not creates, existing element", async () => {
            const testCollection = new TestCollection([...items]);
            const itemToCreate = { _id: 1, value: "uno", group: "odd" };
            const expected = item1;
            const found = await testCollection.findOrCreate({ _id: 1 }, itemToCreate);
            assert.deepStrictEqual(found.value, expected);
            assert.strictEqual(found.existing, true);
        });
        it("creates, not finds, non-existing element", async () => {
            const testCollection = new TestCollection([...items]);
            const itemToCreate = { _id: 4, value: "four", group: "even" };
            const expected = itemToCreate;
            const found = await testCollection.findOrCreate({ _id: 4 }, itemToCreate);
            assert.deepStrictEqual(found.value, expected);
            assert.strictEqual(found.existing, false);
        });
        it("inserts and finds multiple elements", async () => {
            const testCollection = new TestCollection([...items]);
            const newItems = [
                { _id: 11, value: "eleven", group: "odd" },
                { _id: 12, value: "twelve", group: "even" },
                { _id: 13, value: "thirteen", group: "odd" },
            ];
            await testCollection.insertMany(newItems, false);
            const expected = newItems;
            const found = await testCollection.find({ _id: { $gt: 10, $lt: 14 } }, "_id");
            assert.deepStrictEqual(found, expected);
        });
        it("deletes one element", async () => {
            const testCollection = new TestCollection([...items]);
            const expected = item1;
            const deleted = await testCollection.deleteOne({ _id: 1 });
            assert.deepStrictEqual(deleted, expected);
            const found = await testCollection.findOne({ _id: 1 });
            assert.strictEqual(found, null);
            const foundAll = await testCollection.findAll();
            const expectedAll = [item2, item3];
            assert.deepStrictEqual(foundAll, expectedAll);
        });
        it("deletes one element when multiple match", async () => {
            const testCollection = new TestCollection([...items]);
            const expected = item1;
            const deleted = await testCollection.deleteOne({ group: "odd" });
            assert.deepStrictEqual(deleted, expected);
            const foundDeleted = await testCollection.findOne({ _id: 1 });
            assert.strictEqual(foundDeleted, null);
            const foundExisting = await testCollection.findOne({ _id: 3 });
            const expectedExisting = item3;
            assert.strictEqual(foundExisting, expectedExisting);
            const foundAll = await testCollection.findAll();
            const expectedAll = [item2, item3];
            assert.deepStrictEqual(foundAll, expectedAll);
        });
        it("deletes multiple elements", async () => {
            const testCollection = new TestCollection([...items]);
            const expected = [item1, item3];
            const deleted = await testCollection.deleteMany({ group: "odd" });
            assert.deepStrictEqual(deleted, expected);
            const found = await testCollection.find({ group: "odd" }, "_id");
            assert.deepStrictEqual(found, []);
            const foundAll = await testCollection.findAll();
            const expectedAll = [item2];
            assert.deepStrictEqual(foundAll, expectedAll);
        });
    });
});

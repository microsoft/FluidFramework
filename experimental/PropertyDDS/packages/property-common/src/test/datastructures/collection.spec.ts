/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview In this file, we will test the functions exported by datastructres/collection.js
 */

import { expect } from "chai";
import _ from "lodash";

import { Collection } from "../../index";

describe("collection", function () {
	const createObject = () => ({
		item4: Number.NaN,
		item5: undefined,
		item6: null,
		item7: "",
		item8: false,
		item9: {},
		item10: [],
		item11: "test",
		item12: 0,
		item13: 1,
	});

	it("should add a value under a key", function (done) {
		const collection = new Collection<string>();

		expect(collection.add("item1", "test")).to.equal("test");

		expect(collection.has("item1")).to.equal(true);

		collection.add(0, "test2");

		expect(collection.has(0)).to.equal(true);

		done();
	});

	it("should bulk add a key-value object to the list of items", function (done) {
		const collection = new Collection<any>();

		const objectToAdd = createObject();

		expect(collection.bulkAdd(objectToAdd)).to.equal(collection);

		const itemExists = _.every(objectToAdd, (item, key) => collection.has(key));

		expect(itemExists).to.equal(true);

		done();
	});

	it("should remove a value associated with a key", function (done) {
		const collection = new Collection<string>();

		collection.add("item1", "test");

		expect(collection.remove("item1")).to.equal(true);

		expect(collection.has("item1")).to.equal(false);

		expect(collection.remove("item1")).to.equal(false);

		done();
	});

	it("should bulk remove a key-value object from the list of items", function (done) {
		const collection = new Collection();

		const objectToAdd = createObject();

		collection.bulkAdd(objectToAdd);
		collection.bulkRemove(objectToAdd);

		const itemExists = _.every(objectToAdd, (item, key) => collection.has(key));

		expect(itemExists).to.equal(false);

		done();
	});

	it("should check for emptyness", function (done) {
		const collection = new Collection<string>();

		expect(collection.isEmpty()).to.equal(true);

		collection.add("item1", "test");

		expect(collection.isEmpty()).to.equal(false);
		done();
	});

	it("should get the first value in the collection", function (done) {
		const collection = new Collection<string>();

		collection.add("item1", "test1");
		collection.add("item2", "test2");

		expect(collection.getFirstItem()).to.equal("test1");
		done();
	});

	it("should get the last value in the collection", function (done) {
		const collection = new Collection<string>();

		collection.add("item1", "test1");
		collection.add("item2", "test2");

		expect(collection.getLastItem()).to.equal("test2");
		done();
	});

	it("should get the type of the collection", function (done) {
		const collection = new Collection("collection1", Array);

		expect(collection.getType()).to.equal(Array);

		done();
	});

	it("should filter out values based on a predicate function", function (done) {
		const collection = new Collection<number>();

		const objectToAdd = {
			item1: 0,
			item2: 2,
			item3: 3,
		};

		collection.bulkAdd(objectToAdd);

		const filteredCollection = collection.filter((key, item) => item > 0);

		expect(filteredCollection.has("item1")).to.equal(false);
		expect(filteredCollection.has("item2")).to.equal(true);
		expect(filteredCollection.has("item3")).to.equal(true);

		done();
	});

	it("should filter out values based on a key predicate", function (done) {
		const collection = new Collection();

		const objectToAdd = {
			item1: 0,
			item2: 2,
			item3: 3,
		};

		collection.bulkAdd(objectToAdd);

		const filteredCollection = collection.filterByKey(["item2", "item3"]);

		expect(filteredCollection.has("item1")).to.equal(false);
		expect(filteredCollection.has("item2")).to.equal(true);
		expect(filteredCollection.has("item3")).to.equal(true);

		const filteredCollection2 = collection.filterByKey("item2");

		expect(filteredCollection2.has("item1")).to.equal(false);
		expect(filteredCollection2.has("item2")).to.equal(true);
		expect(filteredCollection2.has("item3")).to.equal(false);

		done();
	});

	it("should filter out values based on a value predicate", function (done) {
		const collection = new Collection();

		const objectToAdd = {
			item1: 0,
			item2: 2,
			item3: 3,
		};

		collection.bulkAdd(objectToAdd);

		const filteredCollection = collection.filterByValue(objectToAdd.item1);

		expect(filteredCollection.has("item1")).to.equal(true);
		expect(filteredCollection.has("item2")).to.equal(false);
		expect(filteredCollection.has("item3")).to.equal(false);

		done();
	});

	it("should return the number of elements in the collection", function (done) {
		const collection = new Collection();

		const objectToAdd = {
			item1: 0,
			item2: 2,
			item3: 3,
		};

		collection.bulkAdd(objectToAdd);

		expect(collection.getCount()).to.equal(3);
		done();
	});

	it("should return the list of items in an array", function (done) {
		const collection = new Collection();

		const objectToAdd = {
			item1: 0,
			item2: 2,
			item3: 3,
		};

		collection.bulkAdd(objectToAdd);

		const array = collection.getAsArray();

		expect(array).to.be.an("array");

		const exists = _.every(objectToAdd, (item) => _.includes(array, item));

		expect(exists).to.equal(true);

		done();
	});

	it("should check if an item exists", function (done) {
		const collection = new Collection();

		const objectToAdd = {
			item1: 0,
			item2: 2,
			item3: 3,
		};

		collection.bulkAdd(objectToAdd);

		expect(collection.has("item2")).to.equal(true);
		expect(collection.has("foo")).to.equal(false);

		done();
	});

	it("should get an item from the collection", function (done) {
		const collection = new Collection();

		const objectToAdd = {
			item1: 0,
			item2: 2,
			item3: 3,
		};

		collection.bulkAdd(objectToAdd);

		expect(collection.item("item2")).to.equal(objectToAdd.item2);

		done();
	});

	it("should set the value of a key", function (done) {
		const collection = new Collection();

		const objectToAdd = {
			item1: 0,
			item2: 2,
			item3: 3,
		};

		collection.bulkAdd(objectToAdd);

		collection.set("item1", 5);

		expect(collection.item("item1")).to.equal(5);

		done();
	});

	it("should iterate over the set of items", function (done) {
		const collection = new Collection();

		const objectToAdd = {
			item1: 0,
			item2: 2,
			item3: 3,
		};

		collection.bulkAdd(objectToAdd);

		const result = {};
		collection.iterate(function (key, item) {
			result[key] = item;
		});

		expect(result).to.deep.equal(objectToAdd);

		done();
	});

	it("should iterate over the set of items starting from the tail", function (done) {
		const collection = new Collection();

		const objectToAdd = {
			item1: 0,
			item2: 2,
			item3: 3,
		};

		collection.bulkAdd(objectToAdd);

		const result = {};
		const keys = collection.getKeys();
		let i = keys.length - 1;
		collection.iterateFromTail(function (key, item) {
			result[key] = item;
			expect(key).to.equal(keys[i]);
			i--;
		});

		expect(result).to.deep.equal(objectToAdd);

		done();
	});

	it("should return all items in an JSON format", function (done) {
		const collection = new Collection();

		const objectToAdd = {
			item1: 0,
			item2: 2,
			item3: 3,
		};

		collection.bulkAdd(objectToAdd);

		expect(collection.getItems()).to.deep.equal(objectToAdd);

		done();
	});

	it("should return all keys in an array", function (done) {
		const collection = new Collection();

		const objectToAdd = {
			item1: 0,
			item2: 2,
			item3: 3,
		};

		collection.bulkAdd(objectToAdd);

		expect(collection.getKeys()).to.deep.equal(_.keys(objectToAdd));

		done();
	});

	it("should return the first item in the collection along with the key", function (done) {
		const collection = new Collection();

		collection.add("item1", "test1");
		collection.add("item2", "test2");

		expect(collection.peak()).to.deep.equal({ key: "item1", item: "test1" });

		done();
	});

	describe("clear", function () {
		it("should empty the collection", function (done) {
			const collection = new Collection();

			const objectToAdd = {
				item1: 0,
				item2: 2,
				item3: 3,
			};

			collection.bulkAdd(objectToAdd);

			const ret = collection.clear();

			expect(collection.isEmpty()).to.equal(true);
			expect(ret).to.equal(collection);

			done();
		});

		it("should return the collection itself", function (done) {
			const collection = new Collection();
			const ret = collection.clear();
			expect(ret).to.equal(collection);
			done();
		});
	});

	it("should clone the collection", function (done) {
		const collection = new Collection();

		const objectToAdd = {
			item1: 0,
			item2: 2,
			item3: 3,
		};

		collection.bulkAdd(objectToAdd);

		expect(collection.clone().items).to.deep.equal(collection.items);

		done();
	});

	it("should copy the collection", function (done) {
		const collection = new Collection();

		const objectToAdd = {
			item1: "test",
			item2: true,
			item3: 23,
		};

		collection.bulkAdd(objectToAdd);

		const collection2 = new Collection();

		collection2.copy(collection);

		expect(collection2.items.item1).to.equal(objectToAdd.item1);
		expect(collection2.items.item2).to.equal(objectToAdd.item2);
		expect(collection2.items.item3).to.equal(objectToAdd.item3);

		done();
	});

	it("should invoke the onAdd callback", function (done) {
		const collection = new Collection();

		let triggered = false;

		collection.onAdd = function (key, item) {
			triggered = true;
			expect(key).to.equal("item");
			expect(item).to.equal("value");
		};
		collection.add("item", "value");

		expect(triggered).to.equal(true);

		let callbackCounter = 0;
		const objectToAdd = createObject();

		// now override the onAdd function and check wiether we call it
		// when we bulkAdd
		collection.onAdd = function (key, item) {
			callbackCounter++;
			expect(Object.prototype.hasOwnProperty.call(objectToAdd, key)).to.equal(true);
		};

		collection.bulkAdd(objectToAdd);
		expect(callbackCounter).to.equal(_.keys(objectToAdd).length);

		done();
	});

	it("should invoke the onRemove callback", function (done) {
		const collection = new Collection();

		let triggered = false;

		collection.onRemove = function (key, item) {
			triggered = true;
			expect(key).to.equal("item");
			expect(item).to.equal("value");
		};

		collection.add("item", "value");
		collection.remove("item");
		expect(triggered).to.equal(true);

		// Should not invoke the onRemove here
		triggered = false;
		collection.remove("item");

		expect(triggered).to.equal(false);

		let callbackCounter = 0;
		const objectToAdd = createObject();

		// now override the onRemove function and check wiether we call it
		// when we bulkRemove
		collection.onRemove = function (key, item) {
			callbackCounter++;
			expect(Object.prototype.hasOwnProperty.call(objectToAdd, key)).to.equal(true);
		};

		collection.bulkAdd(objectToAdd);
		collection.bulkRemove(objectToAdd);

		expect(callbackCounter).to.equal(_.keys(objectToAdd).length);

		done();
	});

	it("should stop early when iterating", function () {
		const collection = new Collection();

		const objectToAdd = {
			item1: "test",
			item2: true,
			item3: 23,
		};

		collection.bulkAdd(objectToAdd);

		let iterator = 1;

		collection.iterate(function () {
			if (iterator === 2) {
				return false;
			}

			iterator++;

			return true;
		});

		expect(iterator).to.equal(2);

		iterator = 1;

		collection.iterateFromTail(function () {
			if (iterator === 2) {
				return false;
			}

			iterator++;

			return true;
		});

		expect(iterator).to.equal(2);
	});

	it("should invoke the onClear callback", function (done) {
		const collection = new Collection();

		const objectToAdd = createObject();
		let triggered = false;
		collection.onClear = function (items) {
			triggered = true;
			expect(items).to.deep.equal(objectToAdd);
		};

		// this shouldn't invoke the callback
		collection.clear();

		expect(triggered).to.equal(false);

		collection.bulkAdd(objectToAdd);
		collection.clear();

		expect(triggered).to.equal(true);

		done();
	});
});

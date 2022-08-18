/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { StoredSchemaRepository } from "../schema-stored";
import { initializeForest, IEditableForest } from "../forest";
import { JsonableTree, buildForest, proxifyForest } from "..";
import { brand } from "../util";
import { defaultSchemaPolicy } from "../feature-libraries";

describe("forest-proxy", () => {
	let forest: IEditableForest;
	let proxy: any;

	const content: JsonableTree = {
		type: brand("Test:Person-1.0.0"),
		fields: {
			name: [{ value: "Adam", type: brand("String") }],
			age: [{ value: 35, type: brand("Int32") }],
			salary: [{ value: 10420.2, type: brand("Float32") }],
			friends: [{ value: {
				Mat: "Mat",
			}, type: brand("Map<String>") }],
			address: [{
				fields: {
					street: [{ value: "treeStreet", type: brand("String") }],
					zip: [{ type: brand("String") }],
				},
				type: brand("Test:Address-1.0.0"),
			}],
		},
	};

	beforeEach(() => {
		const schema = new StoredSchemaRepository(defaultSchemaPolicy);
		forest = buildForest(schema);
		initializeForest(forest, [content]);

		proxy = proxifyForest(forest);
	});

	it("proxified forest", () => {
		assert.ok(proxy);
		assert.equal(Object.keys(proxy).length, 5);
	});

	it("read downwards", () => {
		assert.deepEqual(Object.keys(proxy), ["name", "age", "salary", "friends", "address"]);
		assert.equal(proxy.name, "Adam");
		assert.equal(proxy.age, 35);
		assert.equal(proxy.salary, 10420.2);
		assert.deepEqual(proxy.friends, { Mat: "Mat" });
		assert.deepEqual(Object.keys(proxy.address), ["street", "zip"]);
		assert.equal(proxy.address.street, "treeStreet");
	});

	it("read upwards", () => {
		assert.deepEqual(Object.keys(proxy.address), ["street", "zip"]);
		assert.equal(proxy.address.street, "treeStreet");
		assert.deepEqual(Object.keys(proxy), ["name", "age", "salary", "friends", "address"]);
		assert.equal(proxy.name, "Adam");
	});

	it("update property", () => {
		assert.throws(() => (proxy.name = "Bob"), "Not implemented");
	});

	it("add property", () => {
		const zip: JsonableTree = { value: "99999", type: brand("String") };
		assert.throws(() => (proxy.address.zip = zip), "Not implemented");
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { StoredSchemaRepository } from "../../schema-stored";
import { initializeForest } from "../../forest";
import { JsonableTree, buildForest, JsonCursor, jsonableTreeFromCursor, EmptyKey } from "../..";
import { brand } from "../../util";
import { defaultSchemaPolicy, getEditableTree } from "../../feature-libraries";

const person: JsonableTree = {
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
				phones: [{
					type: brand("Test:Phones-1.0.0"),
					fields: {
						[EmptyKey as string]: [
							{ type: brand("String"), value: "+49123456778" },
							{ type: brand("Int32"), value: 123456879 },
						],
					},
				}],
			},
			type: brand("Test:Address-1.0.0"),
		}],
	},
};

const buildTestProxy = (data: JsonableTree): any => {
	const schema = new StoredSchemaRepository(defaultSchemaPolicy);
	const forest = buildForest(schema);
	initializeForest(forest, [data]);

	const proxy = getEditableTree(forest);
	return proxy;
};

describe("forest-proxy", () => {
	it("proxified forest", () => {
		const proxy = buildTestProxy(person);
		assert.ok(proxy);
		assert.equal(Object.keys(proxy).length, 5);
	});

	it("cached children", () => {
		const proxy = buildTestProxy(person);
		assert.equal(proxy.address, proxy.address);
	});

	it("get own property descriptor", () => {
		const proxy = buildTestProxy(person);
		const descriptor = Object.getOwnPropertyDescriptor(proxy, "name");
		assert.deepEqual(descriptor, {
			configurable: true,
			enumerable: true,
			value: { value: "Adam", type: "String" },
			writable: true,
		});
	});

	it("check has field and get value", () => {
		const proxy = buildTestProxy(person);
		assert.equal("name" in proxy, true);
		assert.deepEqual(proxy.name, { value: "Adam", type: "String" });
	});

	it("read downwards", () => {
		const proxy = buildTestProxy(person);
		assert.deepEqual(Object.keys(proxy), ["name", "age", "salary", "friends", "address"]);
		assert.deepEqual(proxy.name, { value: "Adam", type: "String" });
		assert.deepEqual(proxy.age, { value: 35, type: "Int32" });
		assert.deepEqual(proxy.salary, { value: 10420.2, type: "Float32" });
		assert.deepEqual(proxy.friends, { value: { Mat: "Mat" }, type: "Map<String>" });
		assert.deepEqual(Object.keys(proxy.address), ["street", "zip", "phones"]);
		assert.deepEqual(proxy.address.street, { value: "treeStreet", type: "String" });
	});

	it("read upwards", () => {
		const proxy = buildTestProxy(person);
		assert.deepEqual(Object.keys(proxy.address), ["street", "zip", "phones"]);
		assert.deepEqual(proxy.address.phones[1], { value: 123456879, type: "Int32" });
		assert.deepEqual(proxy.address.street, { value: "treeStreet", type: "String" });
		assert.deepEqual(Object.keys(proxy), ["name", "age", "salary", "friends", "address"]);
		assert.deepEqual(proxy.name, { value: "Adam", type: "String" });
	});

	it("access array data", () => {
		const proxy = buildTestProxy(person);
		assert.equal(proxy.address.phones.length, 2);
		assert.deepEqual(proxy.address.phones[1], { value: 123456879, type: "Int32" });
		const expectedPhones = ["+49123456778", 123456879];
		let i = 0;
		for (const phone of proxy.address.phones) {
			assert.equal(phone.value, expectedPhones[i++]);
		}
		assert.deepEqual(proxy.address.phones[0], { value: "+49123456778", type: "String" });
		assert.deepEqual(Object.keys(proxy.address.phones), ["0", "1"]);
		assert.deepEqual(Object.getOwnPropertyNames(proxy.address.phones), ["0", "1", "length"]);
		const act = proxy.address.phones.map((phone: { value: unknown; }) => phone.value);
		assert.deepEqual(act, expectedPhones);
		proxy.address.phones.forEach((phone: { value: unknown; }, index: number) => {
			assert.equal(expectedPhones[index], phone.value);
		});
	});

	it("update property", () => {
		const proxy = buildTestProxy(person);
		assert.throws(() => (proxy.name = "Bob"), "Not implemented");
	});

	it("add property", () => {
		const proxy = buildTestProxy(person);
		const zip: JsonableTree = { value: "99999", type: brand("String") };
		assert.throws(() => (proxy.address.zip = zip), "Not implemented");
	});
});

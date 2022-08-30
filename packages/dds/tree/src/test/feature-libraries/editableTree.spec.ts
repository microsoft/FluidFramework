/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/consistent-type-definitions */
// /* eslint-disable @typescript-eslint/no-non-null-assertion */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { StoredSchemaRepository } from "../../schema-stored";
import { initializeForest } from "../../forest";
import { JsonableTree, EmptyKey, Value } from "../../tree";
import { brand } from "../../util";
import { defaultSchemaPolicy, getEditableTree, IEditableTree, buildForest, typeSymbol, EditableTreeNode } from "../../feature-libraries";

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
							{ type: brand("Test:Phone-1.0.0"), fields: {
								number: [{ value: "012345", type: brand("String") }],
								prefix: [{ value: "0123", type: brand("String") }],
							} },
						],
					},
				}],
			},
			type: brand("Test:Address-1.0.0"),
		}],
	},
};

type ComplexPhone = {
	number: string;
	prefix: string;
};

type Address = {
	street: string;
	zip: string;
	phones: (number | string | ComplexPhone)[];
};

type Person = {
	name: string;
	age: number;
	salary: number;
	friends: Record<string, string>;
	address: Address;
};

const buildTestProxy = async (data: JsonableTree): Promise<EditableTreeNode<Person>> => {
	const schema = new StoredSchemaRepository(defaultSchemaPolicy);
	const forest = buildForest(schema);
	initializeForest(forest, [data]);

	const proxy = getEditableTree<Person>(forest);
	return proxy;
};

describe("editable-tree", () => {
	it("proxified forest", async () => {
		const proxy = await buildTestProxy(person);
		assert.ok(proxy);
		assert.equal(Object.keys(proxy).length, 5);
		assert.equal(proxy[typeSymbol](), "Test:Person-1.0.0");
		assert.equal(proxy[typeSymbol](brand("age")), "Int32");
		// TODO: how to implement this?
		// assert.equal(proxy.address![typeSymbol](), "Test:Address-1.0.0");
		assert.equal((proxy.address as any)[typeSymbol](), "Test:Address-1.0.0");
	});

	it("get own property descriptor", async () => {
		const proxy = await buildTestProxy(person);
		const descriptor = Object.getOwnPropertyDescriptor(proxy, "name");
		assert.deepEqual(descriptor, {
			configurable: true,
			enumerable: true,
			value: "Adam",
			writable: true,
		});
	});

	it("check has field and get value", async () => {
		const proxy = await buildTestProxy(person);
		assert.equal("name" in proxy, true);
		assert.equal(proxy.name, "Adam");
	});

	it("read downwards", async () => {
		const proxy = await buildTestProxy(person);
		assert.deepEqual(Object.keys(proxy), ["name", "age", "salary", "friends", "address"]);
		assert.equal(proxy.name, "Adam");
		assert.equal(proxy.age, 35);
		assert.equal(proxy.salary, 10420.2);
		assert.deepEqual(proxy.friends, { Mat: "Mat" });
		assert.deepEqual(Object.keys(proxy.address), ["street", "zip", "phones"]);
		assert.equal(proxy.address?.street, "treeStreet");
	});

	it("read upwards", async () => {
		const proxy = await buildTestProxy(person);
		assert.deepEqual(Object.keys(proxy.address), ["street", "zip", "phones"]);
		assert.equal(proxy.address?.phones[1], 123456879);
		assert.equal(proxy.address?.street, "treeStreet");
		assert.deepEqual(Object.keys(proxy), ["name", "age", "salary", "friends", "address"]);
		assert.equal(proxy.name, "Adam");
	});

	it("access array data", async () => {
		const proxy = await buildTestProxy(person);
		assert.equal(proxy.address.phones.length, 3);
		assert.equal(proxy.address.phones[1], 123456879);
		const expectedPhones: Value[] = [
			"+49123456778",
			123456879,
			{
				number: "012345",
				prefix: "0123",
			},
		];
		let i = 0;
		for (const phone of proxy.address.phones) {
			const expectedPhone: Value = expectedPhones[i++];
			if (!expectedPhone) {
				continue;
			}
			if (typeof phone === "string" || typeof phone === "number") {
				assert.equal(phone, expectedPhone);
			} else if (phone) {
				assert.equal(phone.number, expectedPhone.number);
				assert.equal(phone.prefix, expectedPhone.prefix);
			}
		}
		assert.equal(proxy.address.phones[0], "+49123456778");
		assert.deepEqual(Object.keys(proxy.address.phones), ["0", "1", "2"]);
		assert.deepEqual(Object.getOwnPropertyNames(proxy.address.phones), ["0", "1", "2", "length"]);
		const act = proxy.address.phones.map((phone: Value): unknown => {
			if (typeof phone === "string" || typeof phone === "number") {
				return phone as Value;
			} else if (phone) {
				const res: Value = {};
				for (const key of Object.keys(phone)) {
					res[key] = phone[key];
				}
				return res;
			}
		});
		assert.deepEqual(act, expectedPhones);
	});

	it("update property", async () => {
		const proxy = await buildTestProxy(person);
		assert.throws(() => (proxy.name = "abc"), "Not implemented");
	});

	it("add property", async () => {
		const proxy = await buildTestProxy(person);
		assert.throws(() => (proxy.address.zip = "999"), "Not implemented");
	});
});

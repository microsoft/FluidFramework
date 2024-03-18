/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { MapFactory, SharedMap } from "@fluidframework/map";
import { SharedString, SharedStringFactory } from "@fluidframework/sequence";
import { type ContainerSchema } from "../types.js";
import { parseDataObjectsFromSharedObjects } from "../utils.js";

class TestDataObject extends DataObject {
	public static readonly Name = "@fluid-example/test-data-object";

	public static readonly factory = new DataObjectFactory(
		TestDataObject.Name,
		TestDataObject,
		[],
		{},
	);
}

describe("parseDataObjectsFromSharedObjects", () => {
	it("should be able to handle basic DDS types", () => {
		const schema = {
			initialObjects: {
				map: SharedMap,
				text: SharedString,
			},
		} satisfies ContainerSchema;
		const [registryEntries, sharedObjects] = parseDataObjectsFromSharedObjects(schema);

		assert.strictEqual(registryEntries.length, 0, "We should have no registry entries");
		assert.strictEqual(sharedObjects.length, 2, "We should have 2 shared objects");

		const types = sharedObjects.map((item) => item.type);
		assert.strictEqual(types[0], MapFactory.Type, "SharedMap should be included");
		assert.strictEqual(types[1], SharedStringFactory.Type, "SharedString should be included");
	});

	it("should be able to handle dup DDS types", () => {
		const schema = {
			initialObjects: {
				map: SharedMap,
				text: SharedString,
				text2: SharedString,
			},
		} satisfies ContainerSchema;
		const [registryEntries, sharedObjects] = parseDataObjectsFromSharedObjects(schema);

		assert.strictEqual(registryEntries.length, 0, "We should have no registry entries");
		assert.strictEqual(sharedObjects.length, 2, "We should have 2 shared objects");

		const types = sharedObjects.map((item) => item.type);
		assert.strictEqual(types[0], MapFactory.Type, "SharedMap should be included");
		assert.strictEqual(types[1], SharedStringFactory.Type, "SharedString should be included");
	});

	it("should be able to handle Data Objects", () => {
		const schema = {
			initialObjects: {
				map: SharedMap,
				do: TestDataObject,
			},
		} satisfies ContainerSchema;
		const [registryEntries, sharedObjects] = parseDataObjectsFromSharedObjects(schema);

		assert.strictEqual(registryEntries.length, 1, "We should have one registry entry");
		assert.strictEqual(sharedObjects.length, 1, "We should have 1 shared object");

		const types = registryEntries.map((item) => item[0]);
		assert.strictEqual(types[0], TestDataObject.Name, "TestDataObject should be included");
	});

	it("should be able to dedup Data Objects", () => {
		const schema = {
			initialObjects: {
				map: SharedMap,
				do: TestDataObject,
				do2: TestDataObject,
			},
		} satisfies ContainerSchema;
		const [registryEntries, sharedObjects] = parseDataObjectsFromSharedObjects(schema);

		assert.strictEqual(registryEntries.length, 1, "We should have one registry entry");
		assert.strictEqual(sharedObjects.length, 1, "We should have 1 shared object");

		const types = registryEntries.map((item) => item[0]);
		assert.strictEqual(types[0], TestDataObject.Name, "TestDataObject should be included");
	});

	it("should be able to dedup Data Objects even if passed as dynamic types", () => {
		const schema: ContainerSchema = {
			initialObjects: {
				map: SharedMap,
				do: TestDataObject,
			},
			dynamicObjectTypes: [SharedString, TestDataObject],
		} satisfies ContainerSchema;
		const [registryEntries, sharedObjects] = parseDataObjectsFromSharedObjects(schema);

		assert.strictEqual(registryEntries.length, 1, "We should have one registry entry");
		assert.strictEqual(sharedObjects.length, 2, "We should have 2 shared object");

		const types = registryEntries.map((item) => item[0]);
		assert.strictEqual(types[0], TestDataObject.Name, "TestDataObject should be included");
	});
});

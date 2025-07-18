/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	DataObject,
	DataObjectFactory,
	createDataObjectKind,
} from "@fluidframework/aqueduct/internal";
import { MapFactory, SharedMap } from "@fluidframework/map/internal";
import { SharedString } from "@fluidframework/sequence/internal";
import { SharedTree } from "@fluidframework/tree/internal";

import type { ContainerSchema } from "../types.js";
import { isTreeContainerSchema, parseDataObjectsFromSharedObjects } from "../utils.js";

class TestDataObjectClass extends DataObject {
	public static readonly Name = "@fluid-example/test-data-object";

	public static readonly factory = new DataObjectFactory({
		type: TestDataObjectClass.Name,
		ctor: TestDataObjectClass,
	});
}

const TestDataObject = createDataObjectKind(TestDataObjectClass);

describe("parseDataObjectsFromSharedObjects", () => {
	it("should be able to handle basic DDS types", () => {
		const [registryEntries, sharedObjects] = parseDataObjectsFromSharedObjects([
			SharedMap,
			SharedString,
		]);

		assert.strictEqual(registryEntries.length, 0, "We should have no registry entries");
		assert.strictEqual(sharedObjects.length, 2, "We should have 2 shared objects");

		const types = sharedObjects.map((item) => item.type);
		assert.strictEqual(types[0], MapFactory.Type, "SharedMap should be included");
		assert.strictEqual(
			types[1],
			SharedString.getFactory().type,
			"SharedString should be included",
		);
	});

	it("should be able to handle dup DDS types", () => {
		const [registryEntries, sharedObjects] = parseDataObjectsFromSharedObjects([
			SharedMap,
			SharedString,
			SharedString,
		]);

		assert.strictEqual(registryEntries.length, 0, "We should have no registry entries");
		assert.strictEqual(sharedObjects.length, 2, "We should have 2 shared objects");

		const types = sharedObjects.map((item) => item.type);
		assert.strictEqual(types[0], MapFactory.Type, "SharedMap should be included");
		assert.strictEqual(
			types[1],
			SharedString.getFactory().type,
			"SharedString should be included",
		);
	});

	it("should be able to handle Data Objects", () => {
		const [registryEntries, sharedObjects] = parseDataObjectsFromSharedObjects([
			SharedMap,
			TestDataObject,
		]);

		assert.strictEqual(registryEntries.length, 1, "We should have one registry entry");
		assert.strictEqual(sharedObjects.length, 1, "We should have 1 shared object");

		const types = registryEntries.map((item) => item[0]);
		assert.strictEqual(types[0], TestDataObject.Name, "TestDataObject should be included");
	});

	it("should be able to dedup Data Objects", () => {
		const [registryEntries, sharedObjects] = parseDataObjectsFromSharedObjects([
			SharedMap,
			TestDataObject,
			TestDataObject,
		]);

		assert.strictEqual(registryEntries.length, 1, "We should have one registry entry");
		assert.strictEqual(sharedObjects.length, 1, "We should have 1 shared object");

		const types = registryEntries.map((item) => item[0]);
		assert.strictEqual(types[0], TestDataObject.Name, "TestDataObject should be included");
	});
});

it("isTreeContainerSchema", () => {
	// #region Valid cases

	assert(
		isTreeContainerSchema({
			initialObjects: {
				tree: SharedTree,
			},
		}),
	);

	assert(
		isTreeContainerSchema({
			initialObjects: {
				tree: SharedTree,
			},
			dynamicObjectTypes: [SharedTree],
		}),
	);

	// #endregion

	// #region Invalid cases

	assert(
		!isTreeContainerSchema({
			initialObjects: {
				map: SharedMap,
			},
		}),
	);

	assert(
		!isTreeContainerSchema({
			initialObjects: {
				foo: SharedTree,
			},
		}),
	);

	assert(
		!isTreeContainerSchema({
			initialObjects: {},
		}),
	);

	assert(
		!isTreeContainerSchema({
			initialObjects: {
				tree: SharedTree,
				otherTree: SharedTree,
			},
		}),
	);

	// #endregion
});

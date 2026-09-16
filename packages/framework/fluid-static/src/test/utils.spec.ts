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
import type { OldestSupportedClientVersion } from "@fluidframework/runtime-definitions";
import { SharedString } from "@fluidframework/sequence/internal";
import { SharedTree } from "@fluidframework/tree/internal";

import { createTreeContainerRuntimeFactory } from "../treeRootDataObject.js";
import type { ContainerSchema, TreeContainerSchema } from "../types.js";
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
		assert.strictEqual(
			types[1],
			SharedString.getFactory().type,
			"SharedString should be included",
		);
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
		assert.strictEqual(
			types[1],
			SharedString.getFactory().type,
			"SharedString should be included",
		);
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

describe("createTreeContainerRuntimeFactory", () => {
	const schema = {
		initialObjects: {
			tree: SharedTree,
		},
	} satisfies TreeContainerSchema;

	it("accepts oldestSupportedClient", () => {
		assert.doesNotThrow(() =>
			createTreeContainerRuntimeFactory({
				schema,
				oldestSupportedClient: "2.0.0",
			}),
		);
	});

	it("continues to accept minVersionForCollaboration", () => {
		assert.doesNotThrow(
			// eslint-disable-next-line import-x/no-deprecated -- verifies the compatibility overload
			() => createTreeContainerRuntimeFactory({ schema, minVersionForCollaboration: "2.0.0" }),
		);
	});

	it("rejects multiple version options", () => {
		const createWithVersionOptions = createTreeContainerRuntimeFactory as unknown as (props: {
			readonly schema: TreeContainerSchema;
			readonly oldestSupportedClient?: OldestSupportedClientVersion;
			readonly minVersionForCollaboration?: OldestSupportedClientVersion;
		}) => unknown;

		assert.throws(
			() =>
				createWithVersionOptions({
					schema,
					oldestSupportedClient: "2.0.0",
					minVersionForCollaboration: "2.0.0",
				}),
			/Specify exactly one/,
		);
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";

import { AzureClient } from "@fluidframework/azure-client";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap, type ISharedMap } from "@fluidframework/map";
import { timeoutPromise } from "@fluidframework/test-utils";

import { ConnectionState } from "@fluidframework/container-loader";
import { createAzureClient } from "./AzureClientFactory";
import { CounterTestDataObject, TestDataObject } from "./TestDataObject";
import { mapWait } from "./utils";

describe("Fluid data updates", () => {
	const connectTimeoutMs = 10_000;
	let client: AzureClient;
	const schema = {
		initialObjects: {
			map1: SharedMap,
		},
	} satisfies ContainerSchema;

	beforeEach("createAzureClient", () => {
		client = createAzureClient();
	});

	/**
	 * Scenario: test when an Azure Client container is created,
	 * it can set the initial objects.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("can set DDSes as initial objects for a container", async () => {
		const { container: newContainer } = await client.createContainer(schema);
		const containerId = await newContainer.attach();

		if (newContainer.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => newContainer.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "container connect() timeout",
			});
		}

		const resources = client.getContainer(containerId, schema);
		await assert.doesNotReject(
			resources,
			() => true,
			"container cannot be retrieved from Azure Fluid Relay",
		);

		const { container } = await resources;
		assert.deepStrictEqual(
			Object.keys(container.initialObjects),
			Object.keys(schema.initialObjects),
		);
	});

	/**
	 * Scenario: test if initialObjects passed into the container functions correctly.
	 *
	 * Expected behavior: initialObjects value loaded in two different containers should mirror
	 * each other after value is changed.
	 */
	it("can change DDSes within initialObjects value", async () => {
		const { container } = await client.createContainer(schema);
		const containerId = await container.attach();

		if (container.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "container connect() timeout",
			});
		}

		const initialObjectsCreate = container.initialObjects;
		const map1Create = initialObjectsCreate.map1;
		map1Create.set("new-key", "new-value");
		const valueCreate: string | undefined = map1Create.get("new-key");

		const { container: containerGet } = await client.getContainer(containerId, schema);
		const map1Get = containerGet.initialObjects.map1;
		const valueGet: string | undefined = await mapWait(map1Get, "new-key");
		assert.strictEqual(valueGet, valueCreate, "container can't change initial objects");
	});

	/**
	 * Scenario: test if we can create DataObjects through initialObjects schema.
	 *
	 * Expected behavior: DataObjects can be retrieved from the original and loaded container.
	 */
	it("can set DataObjects as initial objects for a container", async () => {
		const doSchema: ContainerSchema = {
			initialObjects: {
				mdo1: TestDataObject,
				mdo2: CounterTestDataObject,
			},
		};
		const { container } = await client.createContainer(doSchema);
		const containerId = await container.attach();

		if (container.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "container connect() timeout",
			});
		}

		const initialObjectsCreate = container.initialObjects;
		assert(
			initialObjectsCreate.mdo1 instanceof TestDataObject,
			"container returns the wrong type for mdo1",
		);
		assert(
			initialObjectsCreate.mdo2 instanceof CounterTestDataObject,
			"container returns the wrong type for mdo2",
		);

		const { container: containerGet } = await client.getContainer(containerId, doSchema);
		const initialObjectsGet = containerGet.initialObjects;
		assert(
			initialObjectsGet.mdo1 instanceof TestDataObject,
			"container returns the wrong type for mdo1",
		);
		assert(
			initialObjectsCreate.mdo2 instanceof CounterTestDataObject,
			"container returns the wrong type for mdo2",
		);
	});

	/**
	 * Scenario: test if we can create multiple DataObjects of the same type
	 *
	 * Expected behavior: DataObjects of the same type can be retrieved from the
	 * original and loaded container.
	 * TODO: Known bug that needs to be re-tested once fixed.
	 */
	it("can use multiple DataObjects of the same type", async () => {
		const doSchema: ContainerSchema = {
			initialObjects: {
				mdo1: TestDataObject,
				mdo2: CounterTestDataObject,
				mdo3: CounterTestDataObject,
			},
		};
		const { container } = await client.createContainer(doSchema);
		const containerId = await container.attach();

		if (container.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "container connect() timeout",
			});
		}

		const initialObjectsCreate = container.initialObjects;
		assert(
			initialObjectsCreate.mdo1 instanceof TestDataObject,
			"container returns the wrong type for mdo1",
		);
		assert(
			initialObjectsCreate.mdo2 instanceof CounterTestDataObject,
			"container returns the wrong type for mdo2",
		);
		assert(
			initialObjectsCreate.mdo3 instanceof CounterTestDataObject,
			"container returns the wrong type for mdo3",
		);

		const { container: containerGet } = await client.getContainer(containerId, doSchema);
		const initialObjectsGet = containerGet.initialObjects;
		assert(
			initialObjectsGet.mdo1 instanceof TestDataObject,
			"container returns the wrong type for mdo1",
		);
		assert(
			initialObjectsCreate.mdo2 instanceof CounterTestDataObject,
			"container returns the wrong type for mdo2",
		);
		assert(
			initialObjectsCreate.mdo3 instanceof CounterTestDataObject,
			"container returns the wrong type for mdo3",
		);
	});

	/**
	 * Scenario: test if we can change DataObject value contained within initialObjects
	 *
	 * Expected behavior: DataObject changes are correctly reflected on original and loaded containers
	 */
	it("can change DataObjects within initialObjects value", async () => {
		const doSchema: ContainerSchema = {
			initialObjects: {
				mdo1: TestDataObject,
				mdo2: CounterTestDataObject,
			},
		};
		const { container } = await client.createContainer(doSchema);
		const initialObjectsCreate = container.initialObjects;
		const mdo2 = initialObjectsCreate.mdo2 as CounterTestDataObject;
		mdo2.increment();
		mdo2.increment();
		mdo2.increment();

		assert.strictEqual(mdo2.value, 3);

		const containerId = await container.attach();

		if (container.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "container connect() timeout",
			});
		}

		const { container: containerGet } = await client.getContainer(containerId, doSchema);
		const initialObjectsGet = containerGet.initialObjects;
		const mdo2get = initialObjectsGet.mdo2 as CounterTestDataObject;

		assert.strictEqual(mdo2get.value, 3);

		mdo2get.increment();
		mdo2get.increment();
		assert.strictEqual(mdo2get.value, 5);
	});

	/**
	 * Scenario: test if the optional schema parameter, dynamicObjectTypes (custom data objects),
	 * can be added during runtime and be returned by the container.
	 *
	 * Expected behavior: added loadable object can be retrieved from the container. Loadable
	 * object's id and container config ID should be identical since it's now attached to
	 * the container.
	 */
	it("can create/add loadable objects (custom data object) dynamically during runtime", async () => {
		const dynamicSchema: ContainerSchema = {
			initialObjects: {
				map1: SharedMap,
			},
			dynamicObjectTypes: [TestDataObject],
		};

		const { container } = await client.createContainer(dynamicSchema);
		await container.attach();

		const newDo = await container.create(TestDataObject);
		assert.ok(newDo?.handle);

		const map1 = container.initialObjects.map1 as ISharedMap;
		map1.set("new-pair-id", newDo.handle);
		const handle: IFluidHandle | undefined = await map1.get("new-pair-id");
		const obj: unknown = await handle?.get();
		assert.ok(obj, "container added dynamic objects incorrectly");
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AzureClient } from "@fluidframework/azure-client";
import { ConnectionState } from "@fluidframework/container-loader";
import { ContainerSchema } from "@fluidframework/fluid-static";
import { SharedTree, TreeConfiguration, SchemaFactory } from "@fluidframework/tree";
import { timeoutPromise } from "@fluidframework/test-utils/internal";

import { createAzureClient } from "./AzureClientFactory.js";

const sf = new SchemaFactory("d302b84c-75f6-4ecd-9663-524f467013e3");

/**
 * Define a class that is an array of strings
 * This class is used to create an array in the SharedTree
 */
class StringArray extends sf.array("StringArray", sf.string) {
	/**
	 * Remove the first item in the list if the list is not empty
	 */
	public removeFirst(): void {
		if (this.length > 0) this.removeAt(0);
	}

	/**
	 * Add an item to the beginning of the list
	 */
	public insertNew(str: string): void {
		this.insertAtStart(str);
	}
}

/**
 * This object is passed into the SharedTree via the schematize method.
 */
const treeConfiguration = new TreeConfiguration(
	// Specify the root type - StringArray.
	StringArray,
	// Initial state of the tree which is used for new trees.
	() => new StringArray([]),
);

describe("SharedTree with AzureClient", () => {
	const connectTimeoutMs = 10_000;
	let client: AzureClient;
	const schema = {
		initialObjects: {
			tree1: SharedTree,
		},
	} satisfies ContainerSchema;

	beforeEach("createAzureClient", () => {
		client = createAzureClient();
	});

	/**
	 * Scenario: test when an Azure Client container is created,
	 * it can set the initial objects to SharedTree and do basic SharedTree ops.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("can create a container with SharedTree and do basic ops", async () => {
		const { container: container1 } = await client.createContainer(schema);
		const treeData = container1.initialObjects.tree1.schematize(
			treeConfiguration, // This is defined in schema.ts
		);
		await container1.attach();

		if (container1.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => container1.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "container1 connect() timeout",
			});
		}

		treeData.root.insertNew("test string 1");
		assert.strictEqual(treeData.root.length, 1);
		assert.strictEqual(treeData.root.at(0), "test string 1");

		treeData.root.insertNew("test string 2");
		assert.strictEqual(treeData.root.length, 2);
		assert.strictEqual(treeData.root.at(0), "test string 2");
		assert.strictEqual(treeData.root.at(1), "test string 1");

		treeData.root.removeFirst();
		assert.strictEqual(treeData.root.length, 1);
		assert.strictEqual(treeData.root.at(0), "test string 1");
	});

	/**
	 * Scenario: test when an Azure Client container is created,
	 * and it can be loaded by another container with SharedTree and do basic SharedTree ops.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("can create/load a container with SharedTree collaborate with basic ops", async () => {
		const { container: container1 } = await client.createContainer(schema);
		const treeData1 = container1.initialObjects.tree1.schematize(treeConfiguration);
		const containerId = await container1.attach();

		if (container1.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => container1.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "container1 connect() timeout",
			});
		}

		treeData1.root.insertNew("test string 1");

		const resources = client.getContainer(containerId, schema);
		await assert.doesNotReject(
			resources,
			() => true,
			"container cannot be retrieved from Azure Fluid Relay",
		);
		const { container: container2 } = await resources;
		assert.deepStrictEqual(
			Object.keys(container2.initialObjects),
			Object.keys(schema.initialObjects),
		);

		if (container2.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => container2.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "container2 connect() timeout",
			});
		}

		const treeData2 = container2.initialObjects.tree1.schematize(treeConfiguration);
		assert.strictEqual(treeData2.root.length, 1);
		assert.strictEqual(treeData2.root.at(0), "test string 1");
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";

import { OdspClient } from "@fluid-experimental/odsp-client";
import { AttachState } from "@fluidframework/container-definitions";
import { ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { timeoutPromise } from "@fluidframework/test-utils";

import { ConnectionState } from "@fluidframework/container-loader";
import { IOdspLoginCredentials, createOdspClient } from "./OdspClientFactory";

const clientCreds: IOdspLoginCredentials = {
	username: process.env.odsp__client__login__username as string,
	password: process.env.odsp__client__login__password as string,
};

describe("Container create scenarios", () => {
	const connectTimeoutMs = 10_000;
	let client: OdspClient;
	let schema: ContainerSchema;

	beforeEach(() => {
		client = createOdspClient(clientCreds);
		schema = {
			initialObjects: {
				map1: SharedMap,
			},
		};
	});

	/**
	 * Scenario: test when an Odsp Client container is created,
	 * it is initially detached.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("Created container is detached", async () => {
		const { container } = await client.createContainer(schema);
		assert.strictEqual(
			container.attachState,
			AttachState.Detached,
			"Container should be detached",
		);

		// Make sure we can attach.
		const itemId = await container.attach();
		assert.strictEqual(typeof itemId, "string", "Attach did not return a string ID");
	});

	/**
	 * Scenario: Test attaching a container.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("can attach a container", async () => {
		const { container } = await client.createContainer(schema);
		const itemId = await container.attach();

		if (container.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "container connect() timeout",
			});
		}

		assert.strictEqual(typeof itemId, "string", "Attach did not return a string ID");
		assert.strictEqual(
			container.attachState,
			AttachState.Attached,
			"Container is not attached after attach is called",
		);
	});

	/**
	 * Scenario: Test if attaching a container twice fails.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("cannot attach a container twice", async () => {
		const { container } = await client.createContainer(schema);
		const itemId = await container.attach();

		if (container.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "container connect() timeout",
			});
		}

		assert.strictEqual(typeof itemId, "string", "Attach did not return a string ID");
		assert.strictEqual(
			container.attachState,
			AttachState.Attached,
			"Container is attached after attach is called",
		);
		await assert.rejects(container.attach(), () => true, "Container should not attach twice");
	});

	/**
	 * Scenario: test if Odsp Client can get an existing container.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("can retrieve existing ODSP container successfully", async () => {
		const { container: newContainer } = await client.createContainer(schema);
		const itemId = await newContainer.attach();

		if (newContainer.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => newContainer.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "container connect() timeout",
			});
		}

		const resources = client.getContainer(itemId, schema);
		await assert.doesNotReject(
			resources,
			() => true,
			"container cannot be retrieved from ODSP",
		);
	});

	/**
	 * Scenario: test if Odsp Client can get a non-exiting container.
	 *
	 * Expected behavior: an error should be thrown when trying to get a non-existent container.
	 */
	it("cannot load improperly created container (cannot load a non-existent container)", async () => {
		const containerAndServicesP = client.getContainer("containerConfig", schema);

		const errorFn = (error: Error): boolean => {
			assert.notStrictEqual(error.message, undefined, "Odsp Client error is undefined");
			assert.strict(
				error.message.startsWith("ODSP fetch error [400]"),
				`Unexpected error: ${error.message}`,
			);
			return true;
		};

		await assert.rejects(
			containerAndServicesP,
			errorFn,
			"Odsp Client can load a non-existent container",
		);
	});
});

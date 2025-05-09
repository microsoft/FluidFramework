/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map/internal";
import { OdspClient } from "@fluidframework/odsp-client/internal";
import { timeoutPromise } from "@fluidframework/test-utils/internal";

import { createOdspClient, getCredentials } from "./OdspClientFactory.js";

describe("Container create scenarios", () => {
	const connectTimeoutMs = 10_000;
	let client: OdspClient;
	let schema: ContainerSchema;

	const [clientCreds] = getCredentials();

	if (clientCreds === undefined) {
		throw new Error("Couldn't get login credentials");
	}

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

	/**
	 * Scenario: test if readonly flag is false on a new attached container.
	 *
	 * Expected behavior: readonly flag should be false a new attached container.
	 */
	it("Readonly flag should be false on new attached container)", async () => {
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

		assert.strictEqual(
			container.getReadOnlyState(),
			false,
			"Readonly is not false on newly attached container",
		);
	});

	/**
	 * Scenario: test if readonly event is fired when readonly status changed.
	 *
	 * Expected behavior: readonly event should be fired when readonly status changed.
	 */
	it("Readonly event should be fired when readonly status changed)", async () => {
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

		assert.strictEqual(
			container.getReadOnlyState(),
			false,
			"Readonly is not false on newly attached container",
		);

		let readonlyEventFired = false;
		container.on("readonly", (readonly: boolean) => {
			readonlyEventFired = true;
			assert.strictEqual(
				readonly,
				true,
				"Readonly should not be false after forceReadonly is called",
			);
		});

		// Trigger the forceReadonly function in IContainer to test readonly event.
		// This interface is to expose the forceReadonly function at IFluidContainer level. It helps to silence the TS error when retrieving IContainer from IFluidContainer.
		interface ITestFluidContainer extends IFluidContainer {
			readonly container: IContainer;
		}
		const iContainer = (container as ITestFluidContainer).container;
		assert(iContainer !== undefined, "iContainer is undefined");
		assert(
			iContainer.forceReadonly !== undefined,
			"iContainer's forceReadonly function is undefined",
		);
		iContainer.forceReadonly(true);
		assert.strictEqual(
			readonlyEventFired,
			true,
			"Readonly event was not fired after forceReadonly",
		);
		assert.strictEqual(
			container.getReadOnlyState(),
			true,
			"Readonly should be true after forceReadonly is called",
		);
	});
});

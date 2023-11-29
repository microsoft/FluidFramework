/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-nodejs-modules
import { strict as assert } from "assert";
import { type ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { AttachState } from "@fluidframework/container-definitions";
// import { ConnectionState } from "@fluidframework/container-loader";
// import { timeoutPromise } from "@fluidframework/test-utils";
import { OdspConnectionConfig } from "../interfaces";
import { OdspClient } from "../odspClient";
import { OdspTestTokenProvider } from "./odspTestTokenProvider";

export interface OdspTestCredentials {
	clientId: string;
	clientSecret: string;
	username: string;
	password: string;
}

const clientCreds: OdspTestCredentials = {
	clientId: "<client_id>",
	clientSecret: "<client_secret>",
	username: "<email_id>",
	password: "<password>",
};

function createOdspClient(): OdspClient {
	const connectionProperties: OdspConnectionConfig = {
		tokenProvider: new OdspTestTokenProvider(clientCreds),
		siteUrl: "<site_url>",
		driveId: "<drive_id>",
	};

	return new OdspClient({ connection: connectionProperties });
}

describe("OdspClient", () => {
	// const connectTimeoutMs = 5000;
	let client: OdspClient;
	let schema: ContainerSchema;

	beforeEach(() => {
		client = createOdspClient();
		schema = {
			initialObjects: {
				map: SharedMap,
			},
		};
	});

	/**
	 * Scenario: test when ODSP Client is instantiated correctly, it can create
	 * a container successfully.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("can create new ODSP container successfully", async () => {
		const resourcesP = client.createContainer(schema);

		await assert.doesNotReject(resourcesP, () => true, "container cannot be created in ODSP");
	});

	/**
	 * Scenario: test when an ODSP Client container is created,
	 * it is initially detached.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("created container is detached", async () => {
		const { container } = await client.createContainer(schema);
		assert.strictEqual(
			container.attachState,
			AttachState.Detached,
			"Container should be detached",
		);
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

		// TODO: uncomment this.
		// if (container.connectionState !== ConnectionState.Connected) {
		// 	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		// 	await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
		// 		durationMs: connectTimeoutMs,
		// 		errorMsg: "container connect() timeout",
		// 	});
		// }

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

		// TODO: uncomment this.
		// if (container.connectionState !== ConnectionState.Connected) {
		// 	await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
		// 		durationMs: connectTimeoutMs,
		// 		errorMsg: "container connect() timeout",
		// 	});
		// }

		assert.strictEqual(typeof itemId, "string", "Attach did not return a string ID");
		assert.strictEqual(
			container.attachState,
			AttachState.Attached,
			"Container is attached after attach is called",
		);
		await assert.rejects(container.attach(), () => true, "Container should not attach twice");
	});

	/**
	 * Scenario: test if ODSP Client can get an existing container.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("can retrieve existing ODSP container successfully", async () => {
		const { container: newContainer } = await client.createContainer(schema);
		const itemId = await newContainer.attach();

		// TODO: uncomment this.
		// if (newContainer.connectionState !== ConnectionState.Connected) {
		// 	await timeoutPromise((resolve) => newContainer.once("connected", () => resolve()), {
		// 		durationMs: connectTimeoutMs,
		// 		errorMsg: "container connect() timeout",
		// 	});
		// }

		const resources = client.getContainer(itemId, schema);
		await assert.doesNotReject(
			resources,
			() => true,
			"container cannot be retrieved from ODSP",
		);
	});
});

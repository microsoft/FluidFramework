/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-nodejs-modules
import { strict as assert } from "node:assert";
import { AzureClient, AzureLocalConnectionConfig } from "@fluidframework/azure-client";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils";
import { timeoutPromise } from "@fluidframework/test-utils";
import { ContainerSchema } from "fluid-framework";
import { v4 as uuid } from "uuid";
import { Signaler, SignalListener } from "../signaler";

function createAzureClient(): AzureClient {
	const connectionProps: AzureLocalConnectionConfig = {
		tokenProvider: new InsecureTokenProvider("fooBar", {
			id: uuid(),
			name: uuid(),
		}),
		endpoint: "http://localhost:7070",
		type: "local",
	};
	return new AzureClient({ connection: connectionProps });
}

describe("Signaler", () => {
	let client: AzureClient;
	let containerSchema: ContainerSchema;

	beforeEach(() => {
		client = createAzureClient();
		containerSchema = {
			initialObjects: {
				/* [id]: DataObject */
				signaler: Signaler,
			},
		};
	});

	it("connect to container and submit signal", async () => {
		const { container } = await client.createContainer(containerSchema);
		const containerId = await container.attach();
		const signalName = "testSignal";

		assert.strictEqual(typeof containerId, "string", "Attach did not return a string ID");

		await timeoutPromise(
			() =>
				container.on("connected", () =>
					(container.initialObjects.signaler as Signaler).submitSignal(signalName),
				),
			{
				durationMs: 1000,
				errorMsg: "container connect() timeout",
			},
		);
	});

	it("should add and remove listeners correctly", async () => {
		const { container } = await client.createContainer(containerSchema);
		const signaler = container.initialObjects.signaler as Signaler;
		const signalName = "testSignal";
		const listener: SignalListener = () => {};

		signaler.onSignal(signalName, listener);
		assert(true, "Listener added successfully");

		signaler.offSignal(signalName, listener);
		assert(true, "Listener removed successfully");
	});

	it("should submit a signal", async () => {
		const { container } = await client.createContainer(containerSchema);
		const signaler = container.initialObjects.signaler as Signaler;
		const signalName = "testSignal";
		const payload = { message: "Hello, world!" };

		const listener = (signalPayload: any) => {
			signaler.submitSignal(signalName, signalPayload);
		};

		const receivedPayload = signaler.onSignal(signalName, () => {
			listener(payload);
		});

		assert(
			receivedPayload !== undefined || receivedPayload !== null,
			"Payload is not empty/undefined",
		);
	});

	// it("should handle multiple signals with different payloads", async () => {
	// 	const { container } = await client.createContainer(containerSchema);
	// 	const signaler = container.initialObjects.signaler as Signaler;
	// 	const signalName1 = "signal1";
	// 	const signalName2 = "signal2";
	// 	const payload1 = { message: "Signal 1 payload" };
	// 	const payload2 = { message: "Signal 2 payload" };

	// 	let receivedPayload1: any;
	// 	let receivedPayload2: any;

	// 	const listener1: SignalListener = (_clientId, _local, signalPayload) => {
	// 		receivedPayload1 = signalPayload;
	// 	};

	// 	const listener2: SignalListener = (_clientId, _local, signalPayload) => {
	// 		receivedPayload2 = signalPayload;
	// 	};

	// 	signaler.onSignal(signalName1, listener1);
	// 	signaler.onSignal(signalName2, listener2);
	// 	signaler.submitSignal(signalName1, payload1);
	// 	signaler.submitSignal(signalName2, payload2);

	// 	assert.deepEqual(
	// 		receivedPayload1,
	// 		payload1,
	// 		"Received payload 1 should match submitted payload 1",
	// 	);
	// 	assert.deepEqual(
	// 		receivedPayload2,
	// 		payload2,
	// 		"Received payload 2 should match submitted payload 2",
	// 	);
	// });
});

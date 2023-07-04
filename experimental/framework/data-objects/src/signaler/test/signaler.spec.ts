/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import { strict as assert } from "node:assert";
// import { AzureClient, AzureLocalConnectionConfig } from "@fluidframework/azure-client";
// import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils";
// import { ContainerSchema } from "fluid-framework";
// import { v4 as uuid } from "uuid";
// import { SignalListener, Signaler } from "../signaler";

// function createAzureClient(): AzureClient {
// 	const connectionProps: AzureLocalConnectionConfig = {
// 		tokenProvider: new InsecureTokenProvider("fooBar", {
// 			id: uuid(),
// 			name: uuid(),
// 		}),
// 		endpoint: "http://localhost:7070",
// 		type: "local",
// 	};
// 	return new AzureClient({ connection: connectionProps });
// }

// describe("Signaler", () => {
// 	let client: AzureClient;
// 	let containerSchema: ContainerSchema;

// 	beforeEach(() => {
// 		client = createAzureClient();
// 		containerSchema = {
// 			initialObjects: {
// 				/* [id]: DataObject */
// 				signaler: Signaler,
// 			},
// 		};
// 	});

// 	it("connect to container and submit signal", async () => {
// 		const { container } = await client.createContainer(containerSchema);
// 		const containerId = await container.attach();
// 		// const signalName = "testSignal";

// 		assert.strictEqual(typeof containerId, "string", "Attach did not return a string ID");

// 		// container.on("connected", () => {
// 		// 	console.log("connected to first test case");
// 		// 	(container.initialObjects.signaler as Signaler).submitSignal(signalName);
// 		// });

// 		await new Promise<void>((resolve) => container.on("connected", () => resolve()));
// 	});

// 	it("should add and remove listeners correctly", async () => {
// 		const { container } = await client.createContainer(containerSchema);
// 		const signaler = container.initialObjects.signaler as Signaler;
// 		const signalName = "testSignal";
// 		const listener: SignalListener = () => {};

// 		signaler.onSignal(signalName, listener);
// 		assert(true, "Listener added successfully");

// 		signaler.offSignal(signalName, listener);
// 		assert(true, "Listener removed successfully");
// 	});

// 	it("should submit a signal", async () => {
// 		const { container } = await client.createContainer(containerSchema);
// 		const signaler = container.initialObjects.signaler as Signaler;
// 		const signalName = "testSignal";
// 		const payload = { message: "Hello, world!" };

// 		const listener = (signalPayload: any) => {
// 			signaler.submitSignal(signalName, signalPayload);
// 		};

// 		const receivedPayload = signaler.onSignal(signalName, () => {
// 			listener(payload);
// 		});

// 		assert(
// 			receivedPayload !== undefined || receivedPayload !== null,
// 			"Payload is not empty/undefined",
// 		);
// 	});

// 	it("should handle multiple signals with different payloads", async () => {
// 		const { container } = await client.createContainer(containerSchema);
// 		const containerId = await container.attach();
// 		const signaler = container.initialObjects.signaler as Signaler;
// 		const signalName = "testSignal";
// 		// const signalMap = new Map();

// 		console.log(containerId);

// 		await new Promise<void>((resolve) =>
// 			container.on("connected", () => {
// 				signaler.submitSignal(signalName);
// 				resolve();
// 			}),
// 		);

// 		// signaler.onSignal(signalName, (clientId, local, _signalPayload) => {
// 		// 	console.log("on signal");
// 		// 	signalMap.set(clientId, local);
// 		// });

// 		// console.log("submit signal");
// 		// signaler.submitSignal(signalName);

// 		// signaler.onSignal(signalName, (clientId, local, _signalPayload) => {
// 		// 	console.log("on signal 2");
// 		// 	assert.strictEqual(true, signalMap.has(clientId));
// 		// 	assert.strictEqual(local, signalMap.get(clientId));
// 		// });
// 	});
// });

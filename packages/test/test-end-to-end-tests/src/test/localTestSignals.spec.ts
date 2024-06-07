/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { ConnectionState } from "@fluidframework/container-loader";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import type {
	IContainerRuntimeBase,
	IInboundSignalMessage,
} from "@fluidframework/runtime-definitions/internal";
import {
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	getContainerEntryPointBackCompat,
	timeoutPromise,
} from "@fluidframework/test-utils/internal";

type IContainerRuntimeBaseWithClientId = IContainerRuntimeBase & { clientId?: string | undefined };

enum RuntimeLayer {
	dataStoreRuntime = "dataStoreRuntime",
	containerRuntime = "containerRuntime",
}

interface SignalClient {
	dataStoreRuntime: IFluidDataStoreRuntime;
	containerRuntime: IContainerRuntimeBaseWithClientId;
	signalReceivedCount: number;
	clientId: string | undefined;
}

const testContainerConfig: ITestContainerConfig = {
	fluidDataObjectType: DataObjectFactoryType.Test,
};

const waitForSignal = async (...signallers: { once(e: "signal", l: () => void): void }[]) =>
	Promise.all(
		signallers.map(async (signaller, index) =>
			timeoutPromise((resolve) => signaller.once("signal", () => resolve()), {
				durationMs: 2000,
				errorMsg: `Signaller[${index}] Timeout`,
			}),
		),
	);

const waitForTargetedSignal = async (
	targetedSignaller: { once(e: "signal", l: () => void): void },
	otherSignallers: { once(e: "signal", l: () => void): void }[],
) =>
	Promise.all([
		timeoutPromise((resolve) => targetedSignaller.once("signal", () => resolve()), {
			durationMs: 2000,
			errorMsg: `Targeted Signaller Timeout`,
		}),
		otherSignallers.map(async (signaller, index) =>
			timeoutPromise(
				(reject) =>
					signaller.once("signal", () =>
						reject(`Signaller[${index}] should not have recieved a signal`),
					),
				{
					durationMs: 100,
					value: "No Signal Received",
				},
			),
		),
	]);

describeCompat("TestSignals", "FullCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let dataObject1: ITestFluidObject;
	let dataObject2: ITestFluidObject;

	beforeEach("setup", async () => {
		provider = getTestObjectProvider();
		const container1 = await provider.makeTestContainer(testContainerConfig);
		dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);

		const container2 = await provider.loadTestContainer(testContainerConfig);
		dataObject2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);

		// need to be connected to send signals
		if (container1.connectionState !== ConnectionState.Connected) {
			await new Promise((resolve) => container1.once("connected", resolve));
		}
		if (container2.connectionState !== ConnectionState.Connected) {
			await new Promise((resolve) => container2.once("connected", resolve));
		}
	});
	describe("Attach signal Handlers on Both Clients", () => {
		it("Validate data store runtime signals", async () => {
			let user1SignalReceivedCount = 0;
			let user2SignalReceivedCount = 0;

			dataObject1.runtime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
				if (message.type === "TestSignal") {
					user1SignalReceivedCount += 1;
				}
			});

			dataObject2.runtime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
				if (message.type === "TestSignal") {
					user2SignalReceivedCount += 1;
				}
			});

			dataObject1.runtime.submitSignal("TestSignal", true);
			await waitForSignal(dataObject1.runtime, dataObject2.runtime);
			assert.equal(user1SignalReceivedCount, 1, "client 1 did not received signal");
			assert.equal(user2SignalReceivedCount, 1, "client 2 did not received signal");

			dataObject2.runtime.submitSignal("TestSignal", true);
			await waitForSignal(dataObject1.runtime, dataObject2.runtime);
			assert.equal(user1SignalReceivedCount, 2, "client 1 did not received signal");
			assert.equal(user2SignalReceivedCount, 2, "client 2 did not received signal");
		});

		it("Validate host runtime signals", async () => {
			let user1SignalReceivedCount = 0;
			let user2SignalReceivedCount = 0;
			const user1ContainerRuntime = dataObject1.context.containerRuntime;
			const user2ContainerRuntime = dataObject2.context.containerRuntime;

			user1ContainerRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
				if (message.type === "TestSignal") {
					user1SignalReceivedCount += 1;
				}
			});

			user2ContainerRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
				if (message.type === "TestSignal") {
					user2SignalReceivedCount += 1;
				}
			});

			user1ContainerRuntime.submitSignal("TestSignal", true);
			await waitForSignal(user1ContainerRuntime, user2ContainerRuntime);
			assert.equal(user1SignalReceivedCount, 1, "client 1 did not receive signal");
			assert.equal(user2SignalReceivedCount, 1, "client 2 did not receive signal");

			user2ContainerRuntime.submitSignal("TestSignal", true);
			await waitForSignal(user1ContainerRuntime, user2ContainerRuntime);
			assert.equal(user1SignalReceivedCount, 2, "client 1 did not receive signal");
			assert.equal(user2SignalReceivedCount, 2, "client 2 did not receive signal");
		});
	});

	it("Validate signal events are raised on the correct runtime", async () => {
		let user1HostSignalReceivedCount = 0;
		let user2HostSignalReceivedCount = 0;
		let user1CompSignalReceivedCount = 0;
		let user2CompSignalReceivedCount = 0;
		const user1ContainerRuntime = dataObject1.context.containerRuntime;
		const user2ContainerRuntime = dataObject2.context.containerRuntime;
		const user1DtaStoreRuntime = dataObject1.runtime;
		const user2DataStoreRuntime = dataObject2.runtime;

		user1DtaStoreRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
			if (message.type === "TestSignal") {
				user1CompSignalReceivedCount += 1;
			}
		});

		user2DataStoreRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
			if (message.type === "TestSignal") {
				user2CompSignalReceivedCount += 1;
			}
		});

		user1ContainerRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
			if (message.type === "TestSignal") {
				user1HostSignalReceivedCount += 1;
			}
		});

		user2ContainerRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
			if (message.type === "TestSignal") {
				user2HostSignalReceivedCount += 1;
			}
		});

		user1ContainerRuntime.submitSignal("TestSignal", true);
		await waitForSignal(user1ContainerRuntime, user2ContainerRuntime);
		assert.equal(
			user1HostSignalReceivedCount,
			1,
			"client 1 did not receive signal on host runtime",
		);
		assert.equal(
			user2HostSignalReceivedCount,
			1,
			"client 2 did not receive signal on host runtime",
		);
		assert.equal(
			user1CompSignalReceivedCount,
			0,
			"client 1 should not receive signal on data store runtime",
		);
		assert.equal(
			user2CompSignalReceivedCount,
			0,
			"client 2 should not receive signal on data store runtime",
		);

		user2DataStoreRuntime.submitSignal("TestSignal", true);
		await waitForSignal(user1DtaStoreRuntime, user2DataStoreRuntime);
		assert.equal(
			user1HostSignalReceivedCount,
			1,
			"client 1 should not receive signal on host runtime",
		);
		assert.equal(
			user2HostSignalReceivedCount,
			1,
			"client 2 should not receive signal on host runtime",
		);
		assert.equal(
			user1CompSignalReceivedCount,
			1,
			"client 1 did not receive signal on data store runtime",
		);
		assert.equal(
			user2CompSignalReceivedCount,
			1,
			"client 2 did not receive signal on data store runtime",
		);
	});
});

describeCompat("Targeted Signals", "NoCompat", (getTestObjectProvider) => {
	const numberOfClients = 3;
	assert(numberOfClients >= 2, "Need at least 2 clients for targeted signals");
	let clients: SignalClient[];
	let provider: ITestObjectProvider;

	beforeEach("setup containers", async () => {
		provider = getTestObjectProvider();
		clients = [];
		for (let i = 0; i < numberOfClients; i++) {
			const container = await (i === 0
				? provider.makeTestContainer(testContainerConfig)
				: provider.loadTestContainer(testContainerConfig));
			const dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);

			if (container.connectionState !== ConnectionState.Connected) {
				await new Promise((resolve) => container.once("connected", resolve));
			}

			clients.push({
				dataStoreRuntime: dataObject.runtime,
				containerRuntime: dataObject.context.containerRuntime,
				signalReceivedCount: 0,
				clientId: container.clientId,
			});
		}
	});
	async function sendAndVerifyRemoteSignals(runtime: RuntimeLayer) {
		clients.forEach((client) => {
			client[runtime].on("signal", (message: IInboundSignalMessage, local: boolean) => {
				assert.equal(local, false, "Signal should be remote");
				assert.equal(message.type, "TestSignal", "Signal type should be TestSignal");
				assert.equal(message.content, true, "Signal content should be true");
				client.signalReceivedCount += 1;
			});
		});

		for (let i = 0; i < clients.length; i++) {
			const targetClient = clients[(i + 1) % clients.length];
			clients[i][runtime].submitSignal("TestSignal", true, targetClient.clientId);
			await waitForTargetedSignal(
				targetClient[runtime],
				clients.filter((c) => c !== targetClient).map((c) => c[runtime]),
			);
		}

		clients.forEach((client, index) => {
			assert.equal(
				client.signalReceivedCount,
				1,
				`client ${index + 1} did not receive signal`,
			);
		});
	}
	async function sendAndVerifyLocalSignals(runtime: RuntimeLayer) {
		clients.forEach((client) => {
			client[runtime].on("signal", (message: IInboundSignalMessage, local: boolean) => {
				assert.equal(local, true, "Signal should be local");
				assert.equal(message.type, "TestSignal", "Signal type should be TestSignal");
				assert.equal(message.content, true, "Signal content should be true");
				client.signalReceivedCount += 1;
			});
		});

		for (const client of clients) {
			client[runtime].submitSignal("TestSignal", true, client.clientId);
			await waitForTargetedSignal(
				client[runtime],
				clients.filter((c) => c !== client).map((c) => c[runtime]),
			);
		}

		clients.forEach((client, index) => {
			assert.equal(
				client.signalReceivedCount,
				1,
				`client ${index + 1} did not receive signal`,
			);
		});
	}

	[RuntimeLayer.containerRuntime, RuntimeLayer.dataStoreRuntime].forEach((layer) =>
		describe(`sent from ${layer}`, () => {
			it("can target a remote client", async () => {
				await sendAndVerifyRemoteSignals(layer);
			});

			it("can target the local client", async () => {
				await sendAndVerifyLocalSignals(layer);
			});
		}),
	);
});

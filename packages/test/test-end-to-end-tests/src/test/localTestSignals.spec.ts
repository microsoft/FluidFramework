/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, type CompatType } from "@fluid-private/test-version-utils";
import { ConnectionState } from "@fluidframework/container-loader";

import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
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
import * as semver from "semver";

type IContainerRuntimeBaseWithClientId = IContainerRuntimeBase & { clientId?: string | undefined };

type RuntimeType = IFluidDataStoreRuntime | IContainerRuntimeBaseWithClientId;

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

["NoCompat", "FullCompat"].forEach((compat) =>
	describeCompat("Targeted Signals", compat as CompatType, (getTestObjectProvider) => {
		const numberOfClients = 3;
		assert(numberOfClients >= 2, "Need at least 2 clients for targeted signals");
		let clients: SignalClient[];
		let provider: ITestObjectProvider;
		let createDriverVersion: string;

		beforeEach("setup containers", async () => {
			provider = getTestObjectProvider();
			createDriverVersion = provider.driver.version;
			clients = [];
			for (let i = 0; i < numberOfClients; i++) {
				const container = await (i === 0
					? provider.makeTestContainer(testContainerConfig)
					: provider.loadTestContainer(testContainerConfig));
				const dataObject =
					await getContainerEntryPointBackCompat<ITestFluidObject>(container);
				clients.push({
					dataStoreRuntime: dataObject.runtime,
					containerRuntime: dataObject.context.containerRuntime,
					signalReceivedCount: 0,
					clientId: container.clientId,
				});
				if (container.connectionState !== ConnectionState.Connected) {
					await new Promise((resolve) => container.once("connected", resolve));
				}
			}
		});

		describe("Supported Targeted Signals", () => {
			async function sendAndVerifyRemoteSignals(
				runtime: "containerRuntime" | "dataStoreRuntime",
			) {
				clients.forEach((client) => {
					client[runtime].on(
						"signal",
						(message: IInboundSignalMessage, local: boolean) => {
							assert.equal(local, false, "Signal should be remote");
							assert.equal(
								message.type,
								"TestSignal",
								"Signal type should be TestSignal",
							);
							assert.equal(message.content, true, "Signal content should be true");
							client.signalReceivedCount += 1;
						},
					);
				});

				for (let i = 0; i < numberOfClients; i++) {
					const targetClient = clients[(i + 1) % numberOfClients];
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

			async function sendAndVerifyLocalSignals(
				runtime: "containerRuntime" | "dataStoreRuntime",
			) {
				clients.forEach((client) => {
					client[runtime].on(
						"signal",
						(message: IInboundSignalMessage, local: boolean) => {
							assert.equal(local, true, "Signal should be local");
							assert.equal(
								message.type,
								"TestSignal",
								"Signal type should be TestSignal",
							);
							assert.equal(message.content, true, "Signal content should be true");
							client.signalReceivedCount += 1;
						},
					);
				});

				for (let i = 0; i < numberOfClients; i++) {
					clients[i][runtime].submitSignal("TestSignal", true, clients[i].clientId);
					await waitForTargetedSignal(
						clients[i][runtime],
						clients.filter((c) => c !== clients[i]).map((c) => c[runtime]),
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

			beforeEach("check compat type", async function () {
				// FullCompat tests fail since older loaders do not support targeted signals
				if (compat === "FullCompat") {
					this.skip();
				}
			});

			it("Validates data store runtime remote signals", async () => {
				await sendAndVerifyRemoteSignals("dataStoreRuntime");
			});

			it("Validates ContainerRuntime remote signals", async () => {
				await sendAndVerifyRemoteSignals("containerRuntime");
			});

			it("Validates data store local signals", async () => {
				await sendAndVerifyLocalSignals("dataStoreRuntime");
			});

			it("Validates ContainerRuntime local signals", async () => {
				await sendAndVerifyLocalSignals("containerRuntime");
			});
		});

		describe("Unsupported Targeted Signals", () => {
			async function sendAndVerifyBroadcast(
				runtime: "containerRuntime" | "dataStoreRuntime",
			) {
				const localRuntime = clients[0][runtime];
				localRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
					assert.equal(local, true, "Signal should be local");
					assert.equal(message.type, "TestSignal", "Signal type should be TestSignal");
					assert.equal(message.content, true, "Signal content should be true");
					clients[0].signalReceivedCount += 1;
				});
				clients.forEach((client, index) => {
					if (index !== 0) {
						client[runtime].on(
							"signal",
							(message: IInboundSignalMessage, local: boolean) => {
								assert.equal(local, false, "Signal should be remote");
								assert.equal(
									message.type,
									"TestSignal",
									"Signal type should be TestSignal",
								);
								assert.equal(
									message.content,
									true,
									"Signal content should be true",
								);
								client.signalReceivedCount += 1;
							},
						);
					}
				});
				localRuntime.submitSignal("TestSignal", true, clients[0].clientId);
				await waitForSignal(...clients.map((client) => client[runtime]));
				clients.forEach((client, index) => {
					assert.equal(
						client.signalReceivedCount,
						1,
						`client ${index + 1} did not receive signal`,
					);
				});
			}

			beforeEach("check driver version check", function () {
				// Skip tests where the driver version >= 2.0.0-rc.4.0.0 since it supports targeted signals.
				if (semver.gte(createDriverVersion, "2.0.0-rc.4.0.0")) {
					this.skip();
				}
			});

			it("Validate data store runtime broadcast ", async () => {
				await sendAndVerifyBroadcast("dataStoreRuntime");
			});

			it("Validate ContainerRuntime broadcast", async () => {
				await sendAndVerifyBroadcast("containerRuntime");
			});
		});
	}),
);

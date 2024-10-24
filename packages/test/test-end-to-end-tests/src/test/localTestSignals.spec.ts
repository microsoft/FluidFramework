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
	timeoutPromise as timeoutPromiseUnnamed,
	TimeoutWithError,
	TimeoutWithValue,
} from "@fluidframework/test-utils/internal";

type IContainerRuntimeBaseWithClientId = IContainerRuntimeBase & {
	clientId?: string | undefined;
};

enum RuntimeLayer {
	dataStoreRuntime = "dataStoreRuntime",
	containerRuntime = "containerRuntime",
}

interface SignalClient {
	dataStoreRuntime: IFluidDataStoreRuntime;
	containerRuntime: IContainerRuntimeBaseWithClientId;
	signalReceivedCount: number;
	clientId: string | undefined;
	index: number;
}

const testContainerConfig: ITestContainerConfig = {
	fluidDataObjectType: DataObjectFactoryType.Test,
};

async function timeoutPromise<T = void>(
	executor: (controller: {
		resolve: (value: T | PromiseLike<T>) => void;
		reject: (reason?: any) => void;
	}) => void,
	timeoutOptions: TimeoutWithError | TimeoutWithValue<T> = {},
): Promise<T> {
	return timeoutPromiseUnnamed(
		(resolve, reject) => executor({ resolve, reject }),
		timeoutOptions,
	);
}
async function waitForSignal(...signallers: { once(e: "signal", l: () => void): void }[]) {
	return Promise.all(
		signallers.map(async (signaller, index) =>
			timeoutPromise(({ resolve }) => signaller.once("signal", () => resolve()), {
				durationMs: 2000,
				errorMsg: `Signaller[${index}] Timeout`,
			}),
		),
	);
}

async function waitForTargetedSignal(
	targetedSignaller: { once(e: "signal", l: () => void): void },
	otherSignallers: { runtime: { once(e: "signal", l: () => void): void }; index: number }[],
): Promise<[void, ..."No Signal Received"[]]> {
	return Promise.all([
		timeoutPromise(({ resolve }) => targetedSignaller.once("signal", () => resolve()), {
			durationMs: 2000,
			errorMsg: `Targeted Signaller Timeout`,
		}),
		...otherSignallers.map(async (signaller, index) =>
			timeoutPromise(
				({ reject }) =>
					signaller.runtime.once("signal", () =>
						reject(
							new Error(`Signaller[${signaller.index}] should not have received a signal`),
						),
					),
				{
					durationMs: 100,
					value: "No Signal Received" as const,
					reject: false,
				},
			),
		),
	]);
}

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

	beforeEach("setup containers", async function () {
		provider = getTestObjectProvider();

		/**
		 * Skip targeted signal test for ODSP driver as targeting signals for clients
		 * that share the same websocket connection is not yet supported.
		 * See {@link https://dev.azure.com/fluidframework/internal/_workitems/edit/18261}
		 *
		 * TODO: Re-enable tests once {@link https://dev.azure.com/fluidframework/internal/_workitems/edit/19030} is completed.
		 */
		if (provider.driver.endpointName === "odsp") {
			this.skip();
		}

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
				index: i,
			});
		}
	});

	async function sendAndVerifySignalToTargetClient(
		runtime: RuntimeLayer,
		targetOffset: 0 | 1,
	) {
		const accumulatedFailures: unknown[] = [];
		clients.forEach((client) => {
			client[runtime].on("signal", (message: IInboundSignalMessage, local: boolean) => {
				client.signalReceivedCount += 1;
				// If there are any errors during signal processing, they will be raised later.
				// Errors thrown during signal processing will cause a connection to close.
				// More importantly an error will be reported via telemetry and that would
				// just be noise compared to the test results.
				try {
					if (targetOffset === 0) {
						assert.equal(local, true, "Signal should be local");
					} else {
						assert.equal(local, false, "Signal should be remote");
					}
					assertSignalProperties(message, client.clientId);
				} catch (error) {
					accumulatedFailures.push(error);
				}
			});
		});

		for (let i = 0; i < clients.length; i++) {
			// Reset accumulated failures for each client iteration
			accumulatedFailures.length = 0;
			const targetClient = clients[(i + targetOffset) % clients.length];
			clients[i][runtime].submitSignal(
				"Test Signal Type",
				"Test Signal Content",
				targetClient.clientId,
			);
			const targetedSignalPromise = await waitForTargetedSignal(
				targetClient[runtime],
				clients
					.filter((c) => c !== targetClient)
					.map((c) => ({
						runtime: c[runtime],
						index: c.index,
					})),
			);

			const [targetedSignalResult, ...otherResults] = targetedSignalPromise;
			otherResults.forEach((result) => {
				assert.equal(
					result,
					"No Signal Received",
					"Non-targeted client should not receive signal",
				);
			});
			// Raise any during signal processing errors now
			for (const error of accumulatedFailures) {
				throw error;
			}
		}

		clients.forEach((client, index) => {
			assert.equal(
				client.signalReceivedCount,
				1,
				`client ${index + 1} did not receive signal`,
			);
		});
	}

	async function sendAndVerifySignalToRemoteClient(runtime: RuntimeLayer) {
		return sendAndVerifySignalToTargetClient(runtime, 1);
	}
	async function sendAndVerifySignalToSelf(runtime: RuntimeLayer) {
		return sendAndVerifySignalToTargetClient(runtime, 0);
	}

	function assertSignalProperties(
		message: IInboundSignalMessage,
		clientId: string | undefined,
	) {
		assert.equal(message.type, "Test Signal Type", "signal type mismatch");
		assert.equal(message.content, "Test Signal Content", "signal content mismatch");
		assert.equal(message.targetClientId, clientId, "Signal should be targeted to this client");
	}

	[RuntimeLayer.containerRuntime, RuntimeLayer.dataStoreRuntime].forEach((layer) =>
		describe(`when sent from ${layer}`, () => {
			it("should correctly deliver a targeted message to a specific remote client, identified by their client ID", async () => {
				// This test verifies that when a signal is sent to a specific remote client using their client ID,
				// only that client receives the signal. This is tested by sending a signal from each client to all other clients,
				// and then verifying that each client received exactly one signal
				await sendAndVerifySignalToRemoteClient(layer);
			});

			it("should correctly deliver a targeted message to itself, identified by their own client ID", async () => {
				// This test verifies that when a client targets a signal to itself using its own client ID
				// the signal is correctly received only by the local client. This is tested by sending a signal from each client to itself,
				// and then verifying that each client received exactly one signal with matching type and content.
				await sendAndVerifySignalToSelf(layer);
			});
		}),
	);
});

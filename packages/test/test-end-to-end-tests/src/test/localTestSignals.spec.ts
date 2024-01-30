/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";
import {
	ITestObjectProvider,
	ITestContainerConfig,
	DataObjectFactoryType,
	ITestFluidObject,
	timeoutPromise,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils";
import { describeCompat } from "@fluid-private/test-version-utils";
import { ConnectionState } from "@fluidframework/container-loader";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";

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

type RuntimeType = IFluidDataStoreRuntime | ContainerRuntime;

describeCompat("TestSignals", "FullCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let dataObject1: ITestFluidObject;
	let dataObject2: ITestFluidObject;
	let dataObject3: ITestFluidObject;

	beforeEach("setup", async () => {
		provider = getTestObjectProvider();
		const container1 = await provider.makeTestContainer(testContainerConfig);
		dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);

		const container2 = await provider.loadTestContainer(testContainerConfig);
		dataObject2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);

		const container3 = await provider.loadTestContainer(testContainerConfig);
		dataObject3 = await getContainerEntryPointBackCompat<ITestFluidObject>(container3);

		// need to be connected to send signals
		if (container1.connectionState !== ConnectionState.Connected) {
			await new Promise((resolve) => container1.once("connected", resolve));
		}
		if (container2.connectionState !== ConnectionState.Connected) {
			await new Promise((resolve) => container2.once("connected", resolve));
		}
		if (container3.connectionState !== ConnectionState.Connected) {
			await new Promise((resolve) => container3.once("connected", resolve));
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

	// Skipped Tests: Targeted signal functionality is not currently supported by all services
	describe.skip("Targeted Signals", () => {
		let user1SignalReceivedCount: number;
		let user2SignalReceivedCount: number;
		let user3SignalReceivedCount: number;

		// Type Casting `as ContainerRuntime` since IContainerRuntimeBase does not have targetClientId argument
		const user1ContainerRuntime = dataObject1.context.containerRuntime as ContainerRuntime;
		const user2ContainerRuntime = dataObject2.context.containerRuntime as ContainerRuntime;
		const user3ContainerRuntime = dataObject3.context.containerRuntime as ContainerRuntime;

		const sendAndVerifyRemoteSignals = async (
			runtime1: RuntimeType,
			runtime2: RuntimeType,
			runtime3: RuntimeType,
		) => {
			runtime1.on("signal", (message: IInboundSignalMessage, local: boolean) => {
				assert.equal(local, false, "Signal should be remote");
				if (message.type === "TestSignal") {
					user1SignalReceivedCount += 1;
				}
			});
			runtime2.on("signal", (message: IInboundSignalMessage, local: boolean) => {
				assert.equal(local, false, "Signal should be remote");
				if (message.type === "TestSignal") {
					user2SignalReceivedCount += 1;
				}
			});
			runtime3.on("signal", (message: IInboundSignalMessage, local: boolean) => {
				assert.equal(local, false, "Signal should be remote");
				if (message.type === "TestSignal") {
					user3SignalReceivedCount += 1;
				}
			});

			runtime1.submitSignal("TestSignal", true, runtime2.clientId);
			await waitForSignal(runtime2);
			assert.equal(user1SignalReceivedCount, 0, "client 1 should not receive signal");
			assert.equal(user2SignalReceivedCount, 1, "client 2 did not receive signal");
			assert.equal(user3SignalReceivedCount, 0, "client 3 should not receive signal");

			runtime1.submitSignal("TestSignal", true, runtime3.clientId);
			await waitForSignal(runtime3);
			assert.equal(user1SignalReceivedCount, 0, "client 1 should not receive signal");
			assert.equal(user2SignalReceivedCount, 1, "client 2 should not receive signal");
			assert.equal(user3SignalReceivedCount, 1, "client 3 did not receive signal");

			runtime2.submitSignal("TestSignal", true, runtime1.clientId);
			await waitForSignal(runtime1);
			assert.equal(user1SignalReceivedCount, 1, "client 1 did not receive signal");
			assert.equal(user2SignalReceivedCount, 1, "client 2 should not receive signal");
			assert.equal(user3SignalReceivedCount, 1, "client 3 should not receive signal");
		};

		const sendAndVerifyLocalSignals = async (
			localRuntime: RuntimeType,
			remoteRuntime1: RuntimeType,
			remoteRuntime2: RuntimeType,
		) => {
			localRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
				assert.equal(local, true, "Signal should be local");
				if (message.type === "TestSignal") {
					user1SignalReceivedCount += 1;
				}
			});
			remoteRuntime1.on("signal", (message: IInboundSignalMessage, local: boolean) => {
				throw new Error("Remote client should not receive signal");
			});
			remoteRuntime2.on("signal", (message: IInboundSignalMessage, local: boolean) => {
				throw new Error("Remote client should not receive signal");
			});

			localRuntime.submitSignal("TestSignal", true, localRuntime.clientId);
			await waitForSignal(localRuntime);
			assert.equal(user1SignalReceivedCount, 1, "client 1 did not receive signal");
		};

		beforeEach(() => {
			user1SignalReceivedCount = 0;
			user2SignalReceivedCount = 0;
			user3SignalReceivedCount = 0;
		});

		it("Validate data store runtime remote signals", async () => {
			await sendAndVerifyRemoteSignals(
				dataObject1.runtime,
				dataObject2.runtime,
				dataObject3.runtime,
			);
		});

		it("Validate ContainerRuntime remote signals", async () => {
			await sendAndVerifyRemoteSignals(
				user1ContainerRuntime,
				user2ContainerRuntime,
				user3ContainerRuntime,
			);
		});

		it("Validate data store local signals", async () => {
			await sendAndVerifyLocalSignals(
				dataObject1.runtime,
				dataObject2.runtime,
				dataObject3.runtime,
			);
		});

		it("Validate ContainerRuntime local signals", async () => {
			await sendAndVerifyLocalSignals(
				user1ContainerRuntime,
				user2ContainerRuntime,
				user3ContainerRuntime,
			);
		});
	});
});

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
		let provider: ITestObjectProvider;
		let dataObject1: ITestFluidObject;
		let dataObject2: ITestFluidObject;
		let dataObject3: ITestFluidObject;
		let user1SignalReceivedCount: number;
		let user2SignalReceivedCount: number;
		let user3SignalReceivedCount: number;
		let user1ContainerRuntime: IContainerRuntimeBaseWithClientId;
		let user2ContainerRuntime: IContainerRuntimeBaseWithClientId;
		let user3ContainerRuntime: IContainerRuntimeBaseWithClientId;
		let createDriverVersion: string;

		beforeEach("setup containers", async () => {
			provider = getTestObjectProvider();
			createDriverVersion = provider.driver.version;

			const container1 = await provider.makeTestContainer(testContainerConfig);
			dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);

			const container2 = await provider.loadTestContainer(testContainerConfig);
			dataObject2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);

			const container3 = await provider.loadTestContainer(testContainerConfig);
			dataObject3 = await getContainerEntryPointBackCompat<ITestFluidObject>(container3);

			user1SignalReceivedCount = 0;
			user2SignalReceivedCount = 0;
			user3SignalReceivedCount = 0;

			user1ContainerRuntime = dataObject1.context.containerRuntime;
			user2ContainerRuntime = dataObject2.context.containerRuntime;
			user3ContainerRuntime = dataObject3.context.containerRuntime;

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

		describe("Supported Targeted Signals", () => {
			async function sendAndVerifyRemoteSignals(
				runtime1: RuntimeType,
				runtime2: RuntimeType,
				runtime3: RuntimeType,
			) {
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
				await waitForTargetedSignal(runtime2, [runtime1, runtime3]);
				assert.equal(user1SignalReceivedCount, 0, "client 1 should not receive signal");
				assert.equal(user2SignalReceivedCount, 1, "client 2 did not receive signal");
				assert.equal(user3SignalReceivedCount, 0, "client 3 should not receive signal");

				runtime1.submitSignal("TestSignal", true, runtime3.clientId);
				await waitForTargetedSignal(runtime3, [runtime1, runtime2]);
				assert.equal(user1SignalReceivedCount, 0, "client 1 should not receive signal");
				assert.equal(user2SignalReceivedCount, 1, "client 2 should not receive signal");
				assert.equal(user3SignalReceivedCount, 1, "client 3 did not receive signal");

				runtime2.submitSignal("TestSignal", true, runtime1.clientId);
				await waitForTargetedSignal(runtime1, [runtime2, runtime3]);
				assert.equal(user1SignalReceivedCount, 1, "client 1 did not receive signal");
				assert.equal(user2SignalReceivedCount, 1, "client 2 should not receive signal");
				assert.equal(user3SignalReceivedCount, 1, "client 3 should not receive signal");
			}

			async function sendAndVerifyLocalSignals(
				localRuntime: RuntimeType,
				remoteRuntime1: RuntimeType,
				remoteRuntime2: RuntimeType,
			) {
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
				await waitForTargetedSignal(localRuntime, [remoteRuntime1, remoteRuntime2]);
				assert.equal(user1SignalReceivedCount, 1, "client 1 did not receive signal");
			}

			beforeEach("check compat type", async function () {
				// FullCompat tests fail since older loaders do not support targeted signals
				if (compat === "FullCompat") {
					this.skip();
				}
			});

			it("Validates data store runtime remote signals", async () => {
				await sendAndVerifyRemoteSignals(
					dataObject1.runtime,
					dataObject2.runtime,
					dataObject3.runtime,
				);
			});

			it("Validates ContainerRuntime remote signals", async () => {
				await sendAndVerifyRemoteSignals(
					user1ContainerRuntime,
					user2ContainerRuntime,
					user3ContainerRuntime,
				);
			});

			it("Validates data store local signals", async () => {
				await sendAndVerifyLocalSignals(
					dataObject1.runtime,
					dataObject2.runtime,
					dataObject3.runtime,
				);
			});

			it("Validates ContainerRuntime local signals", async () => {
				await sendAndVerifyLocalSignals(
					user1ContainerRuntime,
					user2ContainerRuntime,
					user3ContainerRuntime,
				);
			});
		});

		describe("Unsupported Targeted Signals", () => {
			async function sendAndVerifyBroadcast(
				localRuntime: RuntimeType,
				remoteRuntime1: RuntimeType,
				remoteRuntime2: RuntimeType,
			) {
				localRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
					assert.equal(local, true, "Signal should be local");
					if (message.type === "TestSignal") {
						user1SignalReceivedCount += 1;
					}
				});
				remoteRuntime1.on("signal", (message: IInboundSignalMessage, local: boolean) => {
					assert.equal(local, false, "Signal should be remote");
					if (message.type === "TestSignal") {
						user2SignalReceivedCount += 1;
					}
				});
				remoteRuntime2.on("signal", (message: IInboundSignalMessage, local: boolean) => {
					assert.equal(local, false, "Signal should be remote");
					if (message.type === "TestSignal") {
						user3SignalReceivedCount += 1;
					}
				});

				localRuntime.submitSignal("TestSignal", true, localRuntime.clientId);
				await waitForSignal(remoteRuntime1);
				assert.equal(user1SignalReceivedCount, 1, "client 1 did not receive signal");
				assert.equal(user2SignalReceivedCount, 1, "client 2 did not receive signal");
				assert.equal(user3SignalReceivedCount, 1, "client 3 did not receive signal");
			}

			beforeEach("check driver version check", function () {
				// Skip tests where the driver version >= 2.0.0-rc.4.0.0 since it supports targeted signals.
				if (semver.gte(createDriverVersion, "2.0.0-rc.4.0.0")) {
					this.skip();
				}
			});

			it("Validate data store runtime broadcast ", async () => {
				await sendAndVerifyBroadcast(
					dataObject1.runtime,
					dataObject2.runtime,
					dataObject3.runtime,
				);
			});

			it("Validate ContainerRuntime broadcast", async () => {
				await sendAndVerifyBroadcast(
					user1ContainerRuntime,
					user2ContainerRuntime,
					user3ContainerRuntime,
				);
			});
		});
	}),
);

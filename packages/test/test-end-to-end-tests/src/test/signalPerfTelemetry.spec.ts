/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { IContainer, IRuntime } from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";
import type { IContainerRuntimeBase } from "@fluidframework/runtime-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	getContainerEntryPointBackCompat,
	timeoutPromise,
} from "@fluidframework/test-utils/internal";
import sinon from "sinon";

type ContainerRuntime = IContainerRuntimeBase &
	IRuntime & {
		clientId?: string | undefined;

		emit(event: "signal"): void;
	};

const waitForSignals = async (
	numSignals: number,
	...signallers: { on(e: "signal", l: () => void): void }[]
) =>
	Promise.all(
		signallers.map(async (signaller, index) =>
			timeoutPromise(
				(resolve) => {
					let count = 0;
					signaller.on("signal", () => {
						count++;
						if (count === numSignals) {
							resolve();
						}
					});
				},
				{
					durationMs: 2000,
					errorMsg: `Signaller[${index}] Timeout`,
				},
			),
		),
	);

describeCompat("Signal performance telemetry", "NoCompat", (getTestObjectProvider, apis) => {
	let provider: ITestObjectProvider;
	let dataObject: ITestFluidObject;
	let container: IContainer;
	let containerRuntime: ContainerRuntime;
	let logger: MockLogger;

	beforeEach("getTestObjectProvider", async () => {
		provider = getTestObjectProvider();

		logger = new MockLogger();

		const testContainerConfig: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			loaderProps: {
				logger,
			},
		};
		container = await provider.makeTestContainer(testContainerConfig);
		dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
		containerRuntime = dataObject.context.containerRuntime as ContainerRuntime;

		// need to be connected to send signals
		if (container.connectionState !== ConnectionState.Connected) {
			await new Promise((resolve) => container.once("connected", resolve));
		}
	});

	describe("for all drivers", () => {
		itExpects(
			"SignalLatency telemetry after 100 broadcast signals",
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:SignalLatency",
					clientType: "interactive",
				},
			],
			async () => {
				// Send 100+ broadcast signals to trigger latency telemetry event
				for (let i = 0; i < 101; i++) {
					containerRuntime.submitSignal("signal", "test");
				}
				await waitForSignals(101, containerRuntime);
			},
		);

		itExpects(
			"SignalLost error event after missing signal is detected",
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:SignalLost",
					clientType: "interactive",
				},
			],
			async () => {
				const processSignalStub = sinon.stub(containerRuntime, "processSignal");

				processSignalStub.callThrough();

				containerRuntime.submitSignal("signal", "test");
				await waitForSignals(1, containerRuntime);

				processSignalStub.callsFake((message, local) => {
					// Simulate a dropped signal
					containerRuntime.emit("signal");
				});

				containerRuntime.submitSignal("signal", "test");
				await waitForSignals(1, containerRuntime);

				processSignalStub.callThrough();

				containerRuntime.submitSignal("signal", "test");
				await waitForSignals(1, containerRuntime);
			},
		);

		itExpects(
			"SignalOutOfOrder error event after a missing signal is received non-sequentially",
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:SignalLost",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:SignalOutOfOrder",
					clientType: "interactive",
				},
			],
			async () => {
				const processSignalStub = sinon.stub(containerRuntime, "processSignal");

				processSignalStub.callThrough();

				containerRuntime.submitSignal("signal", "test");
				await waitForSignals(1, containerRuntime);

				processSignalStub.callsFake((message, local) => {
					// Simulate a dropped signal
					containerRuntime.emit("signal");
				});

				containerRuntime.submitSignal("signal", "test");
				await waitForSignals(1, containerRuntime);

				processSignalStub.callThrough();

				containerRuntime.submitSignal("signal", "test");
				await waitForSignals(1, containerRuntime);

				containerRuntime.processSignal(
					{
						clientId: containerRuntime.clientId,
						content: {
							clientSignalSequenceNumber: 2,
							contents: {
								type: "signal",
								content: "test",
							},
						},
					},
					true,
				);
			},
		);
	});

	describe("for local driver", () => {
		before(function () {
			if (provider.driver.type !== "local") {
				// Skip the tests in non-local driver
				this.skip();
			}
		});

		it("should not emit SignalLost or SignalOutOfOrder error event after rapid broadcasts", async () => {
			// Send 100 rapid broadcast signals
			for (let i = 0; i < 100; i++) {
				containerRuntime.submitSignal("signal", "test");
			}

			await waitForSignals(100, containerRuntime);

			logger.assertMatchNone(
				[
					{
						eventName: "fluid:telemetry:ContainerRuntime:SignalLost",
						clientType: "interactive",
					},
					{
						eventName: "fluid:telemetry:ContainerRuntime:SignalOutOfOrder",
						clientType: "interactive",
					},
				],
				"SignalLost event should not be emitted after rapid broadcasts",
			);
		});

		it("should not emit SignalOutOfOrder after disconnect", async () => {
			for (let i = 0; i < 100; i++) {
				containerRuntime.submitSignal("signal", "test");
			}

			container.disconnect();
			container.connect();

			// need to be connected to send signals
			if (container.connectionState !== ConnectionState.Connected) {
				await new Promise((resolve) => container.once("connected", resolve));
			}

			logger.assertMatchNone(
				[
					{
						eventName: "fluid:telemetry:ContainerRuntime:SignalOutOfOrder",
						clientType: "interactive",
					},
				],
				"SignalOutOfOrder event should not be emitted after disconnect",
			);
		});
	});
});

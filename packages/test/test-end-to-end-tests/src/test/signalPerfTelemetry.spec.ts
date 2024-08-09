/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	getContainerEntryPointBackCompat,
	timeoutPromise,
} from "@fluidframework/test-utils/internal";

const waitForSignal = async (...signallers: { once(e: "signal", l: () => void): void }[]) =>
	Promise.all(
		signallers.map(async (signaller, index) =>
			timeoutPromise((resolve) => signaller.once("signal", () => resolve()), {
				durationMs: 2000,
				errorMsg: `Signaller[${index}] Timeout`,
			}),
		),
	);

describeCompat("Signal performance telemetry", "NoCompat", (getTestObjectProvider, apis) => {
	let provider: ITestObjectProvider;
	let dataObject: ITestFluidObject;
	let container: IContainer;
	let containerRuntime;
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
		containerRuntime = dataObject.context.containerRuntime;

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
					await waitForSignal(containerRuntime);
				}
			},
		);

		itExpects(
			"SignalLost error event after missing signal is detected",
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:SignalLatency",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:SignalLost",
					clientType: "interactive",
				},
			],
			async () => {
				for (let i = 0; i < 101; i++) {
					containerRuntime.submitSignal("signal", "test");
					await waitForSignal(containerRuntime);
				}

				// Process a signal with a sequence number that is higher than expected to simulate missing signals and trigger a SignalLost error event.
				containerRuntime.processSignal(
					{
						clientId: containerRuntime.clientId,
						content: {
							clientSignalSequenceNumber: 150,
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

		itExpects(
			"SignalOutOfOrder error event after a missing signal is received non-sequentially",
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:SignalLatency",
					clientType: "interactive",
				},
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
				for (let i = 0; i < 101; i++) {
					containerRuntime.submitSignal("signal", "test");
					await waitForSignal(containerRuntime);
				}

				// Create gap in signal sequence number. Should trigger SignalLost error event.
				containerRuntime.processSignal(
					{
						clientId: containerRuntime.clientId,
						content: {
							clientSignalSequenceNumber: 150,
							contents: {
								type: "signal",
								content: "test",
							},
						},
					},
					true,
				);

				// Simulate an out-of-order signal by processing a signal in the missing sequence gap range. Should trigger SignalOutOfOrder error event.
				containerRuntime.processSignal(
					{
						clientId: containerRuntime.clientId,
						content: {
							clientSignalSequenceNumber: 148,
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

		itExpects(
			"Multiple SignalLost error events after multiple missing signals are detected",
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:SignalLost",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:SignalLost",
					clientType: "interactive",
				},
			],
			async () => {
				// Initial signal
				containerRuntime.submitSignal("signal", "test");
				await waitForSignal(containerRuntime);

				// Process a signal with a sequence number that is higher than expected to simulate missing signals and trigger a SignalLost error event.
				containerRuntime.processSignal(
					{
						clientId: containerRuntime.clientId,
						content: {
							clientSignalSequenceNumber: 10,
							contents: {
								type: "signal",
								content: "test",
							},
						},
					},
					true,
				);

				// Process a signal with a sequence number that is higher than expected to simulate missing signals and trigger a SignalLost error event.
				containerRuntime.processSignal(
					{
						clientId: containerRuntime.clientId,
						content: {
							clientSignalSequenceNumber: 15,
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

		itExpects(
			"Multiple SignalOutOfOrder error events after multiple missing signals are received non-sequentially",
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:SignalLost",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:SignalOutOfOrder",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:SignalOutOfOrder",
					clientType: "interactive",
				},
			],
			async () => {
				// Initial signal
				containerRuntime.submitSignal("signal", "test");
				await waitForSignal(containerRuntime);

				// Create gap in signal sequence number. Should trigger SignalLost error event.
				containerRuntime.processSignal(
					{
						clientId: containerRuntime.clientId,
						content: {
							clientSignalSequenceNumber: 10,
							contents: {
								type: "signal",
								content: "test",
							},
						},
					},
					true,
				);

				// Simulate an out-of-order signal by processing a signal in the missing sequence gap range. Should trigger SignalOutOfOrder error event.
				containerRuntime.processSignal(
					{
						clientId: containerRuntime.clientId,
						content: {
							clientSignalSequenceNumber: 7,
							contents: {
								type: "signal",
								content: "test",
							},
						},
					},
					true,
				);

				// Simulate an out-of-order signal by processing a signal in the missing sequence gap range. Should trigger SignalOutOfOrder error event.
				containerRuntime.processSignal(
					{
						clientId: containerRuntime.clientId,
						content: {
							clientSignalSequenceNumber: 8,
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

		it("should not emit SignalLost error event after rapid broadcasts", async () => {
			// Send 100 rapid broadcast signals
			for (let i = 0; i < 100; i++) {
				containerRuntime.submitSignal("signal", "test");
				await waitForSignal(containerRuntime);
			}

			logger.assertMatchNone(
				[
					{
						eventName: "fluid:telemetry:ContainerRuntime:SignalLost",
						clientType: "interactive",
					},
				],
				"SignalLost event should not be emitted after rapid broadcasts",
			);
		});

		it("should not emit SignalOutOfOrder error event after rapid broadcasts", async () => {
			// Send 100 rapid broadcast signals
			for (let i = 0; i < 100; i++) {
				containerRuntime.submitSignal("signal", "test");
				await waitForSignal(containerRuntime);
			}

			logger.assertMatchNone(
				[
					{
						eventName: "fluid:telemetry:ContainerRuntime:SignalOutOfOrder",
						clientType: "interactive",
					},
				],
				"SignalOutOfOrder event should not be emitted after rapid broadcasts",
			);
		});

		it("should not emit SignalOutOfOrder after disconnect", async () => {
			// Initial signal
			for (let i = 0; i < 50; i++) {
				containerRuntime.submitSignal("signal", "test");
				await waitForSignal(containerRuntime);
			}

			container.disconnect();
			container.connect();

			// need to be connected to send signals
			if (container.connectionState !== ConnectionState.Connected) {
				await new Promise((resolve) => container.once("connected", resolve));
			}

			// Out of order signal should not trigger error event.
			containerRuntime.processSignal(
				{
					clientId: containerRuntime.clientId,
					content: {
						clientSignalSequenceNumber: 10,
						contents: {
							type: "signal",
							content: "test",
						},
					},
				},
				true,
			);

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

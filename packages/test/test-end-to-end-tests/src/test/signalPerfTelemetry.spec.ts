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

type ContainerRuntime = IContainerRuntimeBase &
	IRuntime & {
		clientId?: string | undefined;
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
				// Initial signal
				containerRuntime.submitSignal("signal", "test");
				await waitForSignals(1, containerRuntime);

				// Simulate receiving next in-sequence signal
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

				// Process a signal with a sequence number that is higher than expected to simulate missing signals and trigger a SignalLost error event.
				containerRuntime.processSignal(
					{
						clientId: containerRuntime.clientId,
						content: {
							clientSignalSequenceNumber: 4,
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
					eventName: "fluid:telemetry:ContainerRuntime:SignalLost",
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
				await waitForSignals(1, containerRuntime);

				// Simulate receiving next in-sequence signal
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

				// Simulate a lost signal by processing a signal with a sequence number that is higher than expected
				containerRuntime.processSignal(
					{
						clientId: containerRuntime.clientId,
						content: {
							clientSignalSequenceNumber: 4,
							contents: {
								type: "signal",
								content: "test",
							},
						},
					},
					true,
				);
				// Simulate an out of order signal
				containerRuntime.processSignal(
					{
						clientId: containerRuntime.clientId,
						content: {
							clientSignalSequenceNumber: 3,
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
				await waitForSignals(1, containerRuntime);

				// Simulate receiving next in-sequence signal
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

				// Simulate a lost signal by processing a signal with a sequence number that is higher than expected
				containerRuntime.processSignal(
					{
						clientId: containerRuntime.clientId,
						content: {
							clientSignalSequenceNumber: 4,
							contents: {
								type: "signal",
								content: "test",
							},
						},
					},
					true,
				);

				// Simulate another lost signal by processing a signal with a sequence number that is higher than expected
				containerRuntime.processSignal(
					{
						clientId: containerRuntime.clientId,
						content: {
							clientSignalSequenceNumber: 6,
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
				await waitForSignals(1, containerRuntime);

				// Simulate receiving next in-sequence signal
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

				// Simulate a lost signal by processing a signal with a sequence number that is higher than expected
				containerRuntime.processSignal(
					{
						clientId: containerRuntime.clientId,
						content: {
							clientSignalSequenceNumber: 5,
							contents: {
								type: "signal",
								content: "test",
							},
						},
					},
					true,
				);

				// Simulate out of order signal
				containerRuntime.processSignal(
					{
						clientId: containerRuntime.clientId,
						content: {
							clientSignalSequenceNumber: 3,
							contents: {
								type: "signal",
								content: "test",
							},
						},
					},
					true,
				);

				// Simulate another out of order signal
				containerRuntime.processSignal(
					{
						clientId: containerRuntime.clientId,
						content: {
							clientSignalSequenceNumber: 4,
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

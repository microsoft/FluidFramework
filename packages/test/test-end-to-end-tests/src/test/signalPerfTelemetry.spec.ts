/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { ConnectionState } from "@fluidframework/container-loader";
import {
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	getContainerEntryPointBackCompat,
	timeoutPromise,
} from "@fluidframework/test-utils/internal";

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

describeCompat("Signal performance telemetry", "NoCompat", (getTestObjectProvider, apis) => {
	let provider: ITestObjectProvider;
	let dataObject: ITestFluidObject;
	let containerRuntime;
	beforeEach("getTestObjectProvider", async () => {
		provider = getTestObjectProvider();
		const container = await provider.makeTestContainer(testContainerConfig);
		dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
		containerRuntime = dataObject.context.containerRuntime;

		// need to be connected to send signals
		if (container.connectionState !== ConnectionState.Connected) {
			await new Promise((resolve) => container.once("connected", resolve));
		}
	});

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

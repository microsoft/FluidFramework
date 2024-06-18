/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ContainerSchema } from "@fluidframework/fluid-static";
import { timeoutPromise } from "@fluidframework/test-utils/internal";
import { TinyliciousClient } from "@fluidframework/tinylicious-client/internal";
import { SharedTree } from "@fluidframework/tree/internal";
import { expect } from "chai";
import type Sinon from "sinon";
import { spy } from "sinon";

import { startTelemetry } from "../factory/index.js";
import {
	ContainerTelemetryEventNames,
	type ContainerConnectedTelemetry,
	type ContainerDisconnectedTelemetry,
	type ContainerDisposedTelemetry,
	type IFluidTelemetry,
	type ITelemetryConsumer,
} from "../index.js";

// This test suite creates an actual IFluidContainer and confirms events are fired with the expected names during the expected events

describe("container telemetry E2E", () => {
	let schema: ContainerSchema;
	let tinyliciousClient: TinyliciousClient;
	let telemetryConsumerConsumeSpy: Sinon.SinonSpy;
	let testTelemetryConsumer: ITelemetryConsumer;

	// Simple test class that will be used as the telemetry consumer.
	class TestTelemetryConsumer implements ITelemetryConsumer {
		public consume(event: IFluidTelemetry): void {
			return;
		}
	}

	before(() => {
		tinyliciousClient = new TinyliciousClient({ connection: { port: 7070 } });
		schema = {
			initialObjects: {
				sharedTree1: SharedTree,
			},
		};

		testTelemetryConsumer = new TestTelemetryConsumer();
		telemetryConsumerConsumeSpy = spy(testTelemetryConsumer, "consume");
	});

	beforeEach(() => {
		// We need to reset the telemetry consumer spy for each test so the trackEvent calls
		// from the last test don't bleed into the next one.
		telemetryConsumerConsumeSpy.resetHistory();
	});

	it("IFluid container's 'connected' system event produces expected ContainerConnectedTelemetry using ITelemetryConsumer", async () => {
		const { container } = await tinyliciousClient.createContainer(schema, "2");

		const containerId = await container.attach();
		startTelemetry({
			container,
			containerId,
			consumers: [testTelemetryConsumer],
		});

		// We don't know exactly when the given container events that we're looking for will fire so we have to
		// wrap the container.on(...) event handler within a promise that will be awaited at the end of the test.
		const { actualContainerTelemetry, expectedContainerTelemetry } = await timeoutPromise<{
			actualContainerTelemetry: ContainerConnectedTelemetry;
			expectedContainerTelemetry: ContainerConnectedTelemetry;
		}>(
			(resolve) => {
				container.on("connected", () => {
					// We are making an assumption here that the 'connected' event is the first and only event sent to the ITelemetryConsumer.
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const containerTelemetryFromSpy = telemetryConsumerConsumeSpy.getCalls()[0]!
						.args[0] as ContainerConnectedTelemetry;

					resolve({
						actualContainerTelemetry: containerTelemetryFromSpy,
						expectedContainerTelemetry: {
							eventName: ContainerTelemetryEventNames.CONNECTED,
							containerId,
							// containerInstanceId is a uniquely generated UUID by the fluid-telemetry's ContainerEventTelemetryProducer class.
							// We can't use the underlying container's id because it is not exposed by IFluidContainer.
							containerInstanceId: containerTelemetryFromSpy.containerInstanceId,
						},
					});
				});
			},
			{ durationMs: 5000, errorMsg: "timeout while waiting for container 'connected' event" },
		);

		expect(expectedContainerTelemetry).to.deep.equal(actualContainerTelemetry);
		// We won't know what the container containerInstanceId will be but we can still check that it is defined.
		expect(actualContainerTelemetry.containerInstanceId)
			.to.be.a("string")
			.with.length.above(0);
	});

	it("IFluid container's 'disconnected' system event produces expected ContainerDisconnectedTelemetry using ITelemetryConsumer", async () => {
		const { container } = await tinyliciousClient.createContainer(schema, "2");

		const containerId = await container.attach();
		startTelemetry({
			container,
			containerId,
			consumers: [testTelemetryConsumer],
		});

		// We don't know exactly when the given container events that we're looking for will fire so we have to
		// wrap the container.on(...) event handler within a promise that will be awaited at the end of the test.
		const { actualContainerTelemetry, expectedContainerTelemetry } = await timeoutPromise<{
			actualContainerTelemetry: ContainerDisconnectedTelemetry;
			expectedContainerTelemetry: ContainerDisconnectedTelemetry;
		}>(
			(resolve) => {
				// Event handler 1: As soon as the container connects, we're ready to initiate a disconnect.
				container.on("connected", () => {
					container.disconnect();
				});

				container.on("disconnected", () => {
					// We are making an assumption here that the 'disconnected' event is the second sent to the ITelemetryConsumer.
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const containerTelemetryFromSpy = telemetryConsumerConsumeSpy.getCalls()[1]!
						.args[0] as ContainerDisconnectedTelemetry;

					resolve({
						actualContainerTelemetry: containerTelemetryFromSpy,
						expectedContainerTelemetry: {
							eventName: ContainerTelemetryEventNames.DISCONNECTED,
							containerId,
							// containerInstanceId is a uniquely generated UUID by the fluid-telemetry's ContainerEventTelemetryProducer class.
							// We can't use the underlying container's id because it is not exposed by IFluidContainer.
							containerInstanceId: containerTelemetryFromSpy.containerInstanceId,
						},
					});
				});
			},
			{
				durationMs: 5000,
				errorMsg:
					"timeout while waiting for container 'connected' and/or 'disconnected' event",
			},
		);

		expect(expectedContainerTelemetry).to.deep.equal(actualContainerTelemetry);
		// We won't know what the container containerInstanceId will be but we can still check that it is defined.
		expect(actualContainerTelemetry.containerInstanceId)
			.to.be.a("string")
			.with.length.above(0);
	});

	it("IFluid container's 'disposed' system event produces expected ContainerDisposedTelemetry using ITelemetryConsumer", async () => {
		const { container } = await tinyliciousClient.createContainer(schema, "2");

		const containerId = await container.attach();
		startTelemetry({
			container,
			containerId,
			consumers: [testTelemetryConsumer],
		});

		// We don't know exactly when the given container events that we're looking for will fire so we have to
		// wrap the container.on(...) event handler within a promise that will be awaited at the end of the test.
		const { actualContainerTelemetry, expectedContainerTelemetry } = await timeoutPromise<{
			actualContainerTelemetry: ContainerDisposedTelemetry;
			expectedContainerTelemetry: ContainerDisposedTelemetry;
		}>(
			(resolve, reject) => {
				// Event handler 1: As soon as the container connects, we're ready to initiate a disconnect.
				container.on("connected", () => {
					container.disconnect();
				});

				// Event handler 2: As soon as the container disconnects, we're ready to initiate a dispose.
				container.on("disconnected", () => {
					container.dispose();
				});

				container.on("disposed", () => {
					// We are making an assumption here that the 'disposed' event is the third sent to the ITelemetryConsumer.
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const containerTelemetryFromSpy = telemetryConsumerConsumeSpy.getCalls()[2]!
						.args[0] as ContainerDisposedTelemetry;

					resolve({
						actualContainerTelemetry: containerTelemetryFromSpy,
						expectedContainerTelemetry: {
							eventName: ContainerTelemetryEventNames.DISPOSED,
							containerId,
							// containerInstanceId is a uniquely generated UUID by the fluid-telemetry's ContainerEventTelemetryProducer class.
							// We can't use the underlying container's id because it is not exposed by IFluidContainer.
							containerInstanceId: containerTelemetryFromSpy.containerInstanceId,
						},
					});
				});
			},
			{
				durationMs: 5000,
				errorMsg:
					"timeout while waiting for container 'connected' and/or 'disconnected' event",
			},
		);

		expect(expectedContainerTelemetry).to.deep.equal(actualContainerTelemetry);
		// We won't know what the container containerInstanceId will be but we can still check that it is defined.
		expect(actualContainerTelemetry.containerInstanceId)
			.to.be.a("string")
			.with.length.above(0);
	});
});

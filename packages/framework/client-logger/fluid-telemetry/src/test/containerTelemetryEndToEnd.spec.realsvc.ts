/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TinyliciousClient } from "@fluidframework/tinylicious-client/internal";
import { SharedTree } from "@fluid-experimental/tree";
import type Sinon from "sinon";
import { spy } from "sinon";
import { expect } from "chai";
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
	let schema;
	let tinyliciousClient: TinyliciousClient;
	let telemetryConsumerConsumeSpy: Sinon.SinonSpy;
	let testTelemetryConsumer: ITelemetryConsumer;

	// Simple test class that will be used as the telemetry consumer.
	class TestTelemetryConsumer implements ITelemetryConsumer {
		/**
		 * Takes the incoming {@link IFluidTelemetry} and sends it to Azure App Insights
		 */
		public consume(event: IFluidTelemetry): void {
			return;
		}
	}

	before(() => {
		tinyliciousClient = new TinyliciousClient({ connection: { port: 7070 } });
		schema = {
			initialObjects: {
				sharedMap1: SharedTree,
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

	it("IFluid container's 'connected' system event produces expected ContainerConnectedTelemetry using AppInsightsTelemetryConsumer", async () => {
		const { container } = await tinyliciousClient.createContainer(schema);

		const containerId = await container.attach();
		startTelemetry({
			container,
			containerId,
			consumers: [testTelemetryConsumer],
		});

		// We don't know exactly when the given container events will fire and we can't await specific events so we have to
		// wrap the container.on(...) event handler within a promise that will be awaited at the end of the test.
		const testCompletePromise = new Promise<void>((resolve, reject) => {
			// We Capture and analyze telemetry after the container connected event
			container.on("connected", () => {
				// Obtain the calls made to the TestTelemetryConsumer consume() method
				const actualConsumedConnectedTelemetry: ContainerConnectedTelemetry[] =
					telemetryConsumerConsumeSpy
						.getCalls()
						.map((spyCall) => spyCall.args[0] as IFluidTelemetry)
						.filter(
							(telemetry) =>
								telemetry.eventName === ContainerTelemetryEventNames.CONNECTED,
						) as ContainerConnectedTelemetry[];

				if (actualConsumedConnectedTelemetry.length === 0) {
					console.log("Failed to find expected telemetry");
					reject(
						new Error(
							"Expected TestTelemetryConsumer.consume() to be called alteast once with expected container telemetry but was not.",
						),
					);
				}

				const actualContainerTelemetry = actualConsumedConnectedTelemetry[0];
				const expectedContainerTelemetry: ContainerConnectedTelemetry = {
					eventName: ContainerTelemetryEventNames.CONNECTED,
					containerId,
					containerInstanceId: actualContainerTelemetry.containerInstanceId,
				};

				try {
					expect(expectedContainerTelemetry).to.deep.equal(actualContainerTelemetry);
					// We won't know what the container containerInstanceId will be but we can still check that it is defined.
					expect(actualContainerTelemetry.containerInstanceId)
						.to.be.a("string")
						.with.length.above(0);
					// This will enable the test to finally complete.
					resolve();
				} catch (error) {
					reject(error); // Reject the promise with the assertion error
				}
			});
		});

		await testCompletePromise;
	});

	it("IFluid container's 'disconnected' system event produces expected ContainerDisconnectedTelemetry using AppInsightsTelemetryConsumer", async () => {
		const { container } = await tinyliciousClient.createContainer(schema);

		const containerId = await container.attach();
		startTelemetry({
			container,
			containerId,
			consumers: [testTelemetryConsumer],
		});

		// We don't know exactly when the given container events will fire and we can't await specific events so we have to
		// wrap the container.on(...) event handler within a promise that will be awaited at the end of the test.
		const testCompletePromise = new Promise<void>((resolve, reject) => {
			// Event handler 1: As soon as the container connects, we're ready to initiate a disconnect.
			container.on("connected", () => {
				container.disconnect();
			});

			container.on("disconnected", () => {
				// Obtain the calls made to the TestTelemetryConsumer consume() method
				const actualConsumedDisconnectedTelemetry: ContainerDisconnectedTelemetry[] =
					telemetryConsumerConsumeSpy
						.getCalls()
						.map((spyCall) => spyCall.args[0] as IFluidTelemetry)
						.filter(
							(telemetry) =>
								telemetry.eventName === ContainerTelemetryEventNames.DISCONNECTED,
						) as ContainerDisconnectedTelemetry[];

				if (actualConsumedDisconnectedTelemetry.length === 0) {
					reject(
						new Error(
							"Expected TestTelemetryConsumer.consume() to be called alteast once with expected container telemetry but was not.",
						),
					);
				}

				const actualContainerTelemetry = actualConsumedDisconnectedTelemetry[0];
				const expectedContainerTelemetry: ContainerDisconnectedTelemetry = {
					eventName: ContainerTelemetryEventNames.DISCONNECTED,
					containerId,
					containerInstanceId: actualContainerTelemetry.containerInstanceId,
				};
				try {
					expect(expectedContainerTelemetry).to.deep.equal(actualContainerTelemetry);
					// We won't know what the container containerInstanceId will be but we can still check that it is defined.
					expect(actualContainerTelemetry.containerInstanceId)
						.to.be.a("string")
						.with.length.above(0);

					// This will enable the test to finally complete.
					resolve();
				} catch (error) {
					reject(error); // Reject the promise with the assertion error
				}
			});
		});

		await testCompletePromise;
	});

	it("IFluid container's 'disposed' system event produces expected ContainerDisposedTelemetry using AppInsightsTelemetryConsumer", async () => {
		const { container } = await tinyliciousClient.createContainer(schema);

		const containerId = await container.attach();
		startTelemetry({
			container,
			containerId,
			consumers: [testTelemetryConsumer],
		});

		// We don't know exactly when the given container events will fire and we can't await specific events so we have to
		// wrap the container.on(...) event handler within a promise that will be awaited at the end of the test.
		const testCompletePromise = new Promise<void>((resolve, reject) => {
			// Event handler 1: As soon as the container connects, we're ready to initiate a disconnect.
			container.on("connected", () => {
				container.disconnect();
			});

			// Event handler 2: As soon as the container disconnects, we're ready to initiate a dispose.
			container.on("disconnected", () => {
				container.dispose();
			});

			container.on("disposed", () => {
				// Obtain the calls made to the TestTelemetryConsumer consume() method
				const actualConsumedDisposedTelemetry: ContainerDisposedTelemetry[] =
					telemetryConsumerConsumeSpy
						.getCalls()
						.map((spyCall) => spyCall.args[0] as IFluidTelemetry)
						.filter(
							(telemetry) =>
								telemetry.eventName === ContainerTelemetryEventNames.DISPOSED,
						) as ContainerDisposedTelemetry[];

				if (actualConsumedDisposedTelemetry.length === 0) {
					reject(
						new Error(
							"Expected TestTelemetryConsumer.consume() to be called alteast once with expected container telemetry but was not.",
						),
					);
				}
				const actualContainerTelemetry = actualConsumedDisposedTelemetry[0];
				const expectedContainerTelemetry: ContainerDisposedTelemetry = {
					eventName: ContainerTelemetryEventNames.DISPOSED,
					containerId,
					containerInstanceId: actualContainerTelemetry.containerInstanceId,
				};

				try {
					expect(expectedContainerTelemetry).to.deep.equal(actualContainerTelemetry);
					// We won't know what the container containerInstanceId will be but we can still check that it is defined.
					expect(actualContainerTelemetry.containerInstanceId)
						.to.be.a("string")
						.with.length.above(0);

					// This will enable the test to finally complete.
					resolve();
				} catch (error) {
					reject(error); // Reject the promise with the assertion error
				}
			});
		});

		await testCompletePromise;
	});
});

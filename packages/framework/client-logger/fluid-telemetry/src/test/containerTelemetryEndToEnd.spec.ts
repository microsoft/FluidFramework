/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TinyliciousClient } from "@fluidframework/tinylicious-client/internal";
import { SharedTree } from "@fluid-experimental/tree";
import * as AppInsights from "@microsoft/applicationinsights-web";
import type Sinon from "sinon";
import { spy } from "sinon";
import { expect } from "chai";
import { startTelemetry } from "../factory/index.js";
import {
	AppInsightsTelemetryConsumer,
	ContainerTelemetryEventNames,
	type ContainerConnectedTelemetry,
	type ContainerDisconnectedTelemetry,
	type ContainerDisposedTelemetry,
	type IContainerTelemetry,
} from "../index.js";

// This test suite creates an actual IFluidContainer and confirms events are fired with the expected names during the expected events

describe("container telemetry E2E", () => {
	let schema;
	let tinyliciousClient: TinyliciousClient;
	let appInsightsClient: AppInsights.ApplicationInsights;
	let appInsightsTrackEventSpy: Sinon.SinonSpy;

	before(() => {
		tinyliciousClient = new TinyliciousClient({ connection: { port: 7070 } });
		schema = {
			initialObjects: {
				sharedMap1: SharedTree,
			},
		};

		appInsightsClient = new AppInsights.ApplicationInsights({
			config: {
				connectionString:
					// (this is an example string)
					"InstrumentationKey=abcdefgh-ijkl-mnop-qrst-uvwxyz6ffd9c;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/",
			},
		});
		appInsightsTrackEventSpy = spy(appInsightsClient, "trackEvent");
	});

	beforeEach(() => {
		// We need to reset the Application Insights client spy for each test so the trackEvent calls
		// from the last test don't bleed into the next one.
		appInsightsTrackEventSpy.resetHistory();
	});

	it("IFluid container's 'connected' system event produces expected ContainerConnectedTelemetry using AppInsightsTelemetryConsumer", async () => {
		const { container } = await tinyliciousClient.createContainer(schema);

		const containerId = await container.attach();
		startTelemetry({
			container,
			containerId,
			consumers: [new AppInsightsTelemetryConsumer(appInsightsClient)],
		});

		// We don't know exactly when the given container events will fire and we can't await specific events so we have to
		// wrap the container.on(...) event handler within a promise that will be awaited at the end of the test.
		const testCompletePromise = new Promise<void>((resolve, reject) => {
			// We Capture and analyze telemetry after the container connected event
			container.on("connected", () => {
				// Obtain the calls made to the appInsights trackEvent method
				const actualEmittedAppInsightsTelemetry: AppInsights.IEventTelemetry[] =
					appInsightsTrackEventSpy
						.getCalls()
						.map((spyCall) => spyCall.args[0] as AppInsights.IEventTelemetry)
						.filter(
							(telemetry) =>
								telemetry.name === ContainerTelemetryEventNames.CONNECTED,
						);

				if (actualEmittedAppInsightsTelemetry.length === 0) {
					console.log("Failed to find expected telemetry");
					reject(
						new Error(
							"Expected AppInsights.trackEvent() to be called alteast once with expected container telemetry but was not.",
						),
					);
				}
				const actualAppInsightsTelemetry = actualEmittedAppInsightsTelemetry[0];
				const actualContainerTelemetry =
					actualAppInsightsTelemetry.properties as IContainerTelemetry;

				const expectedAppInsightsTelemetry: AppInsights.IEventTelemetry = {
					name: ContainerTelemetryEventNames.CONNECTED,
					properties: {
						eventName: ContainerTelemetryEventNames.CONNECTED,
						containerId,
						containerInstanceId: actualContainerTelemetry.containerInstanceId,
					} satisfies ContainerConnectedTelemetry,
				};

				try {
					expect(expectedAppInsightsTelemetry).to.deep.equal(actualAppInsightsTelemetry);
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
			consumers: [new AppInsightsTelemetryConsumer(appInsightsClient)],
		});

		// We don't know exactly when the given container events will fire and we can't await specific events so we have to
		// wrap the container.on(...) event handler within a promise that will be awaited at the end of the test.
		const testCompletePromise = new Promise<void>((resolve, reject) => {
			// Event handler 1: As soon as the container connects, we're ready to initiate a disconnect.
			container.on("connected", () => {
				container.disconnect();
			});

			container.on("disconnected", () => {
				// Obtain the calls made to the appInsights trackEvent method
				const actualEmittedAppInsightsTelemetry: AppInsights.IEventTelemetry[] =
					appInsightsTrackEventSpy
						.getCalls()
						.map((spyCall) => spyCall.args[0] as AppInsights.IEventTelemetry)
						.filter(
							(telemetry) =>
								telemetry.name === ContainerTelemetryEventNames.DISCONNECTED,
						);

				if (actualEmittedAppInsightsTelemetry.length === 0) {
					reject(
						new Error(
							"Expected AppInsights.trackEvent() to be called alteast once with expected container telemetry but was not.",
						),
					);
				}
				const actualAppInsightsTelemetry = actualEmittedAppInsightsTelemetry[0];
				const actualContainerTelemetry =
					actualAppInsightsTelemetry.properties as IContainerTelemetry;

				const expectedAppInsightsTelemetry: AppInsights.IEventTelemetry = {
					name: ContainerTelemetryEventNames.DISCONNECTED,
					properties: {
						eventName: ContainerTelemetryEventNames.DISCONNECTED,
						containerId,
						containerInstanceId: actualContainerTelemetry.containerInstanceId,
					} satisfies ContainerDisconnectedTelemetry,
				};
				try {
					expect(expectedAppInsightsTelemetry).to.deep.equal(actualAppInsightsTelemetry);
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
			consumers: [new AppInsightsTelemetryConsumer(appInsightsClient)],
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
				// Obtain the calls made to the appInsights trackEvent method
				const actualEmittedAppInsightsTelemetry: AppInsights.IEventTelemetry[] =
					appInsightsTrackEventSpy
						.getCalls()
						.map((spyCall) => spyCall.args[0] as AppInsights.IEventTelemetry)
						.filter(
							(telemetry) => telemetry.name === ContainerTelemetryEventNames.DISPOSED,
						);

				if (actualEmittedAppInsightsTelemetry.length === 0) {
					reject(
						new Error(
							"Expected AppInsights.trackEvent() to be called alteast once with expected container telemetry but was not.",
						),
					);
				}
				const actualAppInsightsTelemetry = actualEmittedAppInsightsTelemetry[0];
				const actualContainerTelemetry =
					actualAppInsightsTelemetry.properties as IContainerTelemetry;

				const expectedAppInsightsTelemetry: AppInsights.IEventTelemetry = {
					name: ContainerTelemetryEventNames.DISPOSED,
					properties: {
						eventName: ContainerTelemetryEventNames.DISPOSED,
						containerId,
						containerInstanceId: actualContainerTelemetry.containerInstanceId,
					} satisfies ContainerDisposedTelemetry,
				};

				try {
					expect(expectedAppInsightsTelemetry).to.deep.equal(actualAppInsightsTelemetry);
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

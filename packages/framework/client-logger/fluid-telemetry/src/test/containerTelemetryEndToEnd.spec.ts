/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TinyliciousClient } from "@fluidframework/tinylicious-client/internal";
import { SharedTree } from "@fluid-experimental/tree";
import * as AppInsights from "@microsoft/applicationinsights-web";
import type Sinon from "sinon";
import { spy } from "sinon";
import { assert, expect } from "chai";
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

		// We Capture and analyze telemetry after the container connected event
		let didTestPass = false;
		container.on("connected", () => {
			// Obtain the calls made to the appInsights trackEvent method
			const actualEmittedAppInsightsTelemetry: AppInsights.IEventTelemetry[] =
				appInsightsTrackEventSpy
					.getCalls()
					.map((spyCall) => spyCall.args[0] as AppInsights.IEventTelemetry)
					.filter(
						(telemetry) => telemetry.name === ContainerTelemetryEventNames.CONNECTED,
					);

			if (actualEmittedAppInsightsTelemetry.length === 0) {
				assert.fail(
					"Expected AppInsights.trackEvent() to be called alteast once with expected container telemetry but was not.",
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

			expect(expectedAppInsightsTelemetry).to.deep.equal(actualAppInsightsTelemetry);
			// We won't know what the container containerInstanceId will be but we can still check that it is defined.
			expect(actualContainerTelemetry.containerInstanceId)
				.to.be.a("string")
				.with.length.above(0);

			// This will enable the while loop at the end of this test to finally complete,
			// We  want the test to complete as soon as we recieve the container event and complete our testing
			didTestPass = true;
		});

		// We don't know exactly when the given container events will fire and we can't await specific events so we have to
		// have a while loop that keeps the test alive until the container notifies us with its event handlers.
		while (!didTestPass) {
			const timeout = async (ms: number): Promise<void> => {
				return new Promise((resolve) => setTimeout(resolve, ms));
			};
			await timeout(25);
		}
	}).timeout(5000);

	it("IFluid container's 'disconnected' system event produces expected ContainerDisconnectedTelemetry using AppInsightsTelemetryConsumer", async () => {
		const { container } = await tinyliciousClient.createContainer(schema);

		const containerId = await container.attach();
		startTelemetry({
			container,
			containerId,
			consumers: [new AppInsightsTelemetryConsumer(appInsightsClient)],
		});

		// Event handler 1: As soon as the container connects, we're ready to initiate a disconnect.
		container.on("connected", () => {
			container.disconnect();
		});

		// Event handler 2: capturing and analyzing telemetry after the container disconnected event
		let didTestPass = false;
		container.on("disconnected", () => {
			// Obtain the calls made to the appInsights trackEvent method
			const actualEmittedAppInsightsTelemetry: AppInsights.IEventTelemetry[] =
				appInsightsTrackEventSpy
					.getCalls()
					.map((spyCall) => spyCall.args[0] as AppInsights.IEventTelemetry)
					.filter(
						(telemetry) => telemetry.name === ContainerTelemetryEventNames.DISCONNECTED,
					);

			if (actualEmittedAppInsightsTelemetry.length === 0) {
				assert.fail(
					"Expected AppInsights.trackEvent() to be called alteast once with expected container telemetry but was not.",
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

			expect(expectedAppInsightsTelemetry).to.deep.equal(actualAppInsightsTelemetry);
			// We won't know what the container containerInstanceId will be but we can still check that it is defined.
			expect(actualContainerTelemetry.containerInstanceId)
				.to.be.a("string")
				.with.length.above(0);

			// This will enable the while loop at the end of this test to finally complete,
			// We  want the test to complete as soon as we recieve the container event and complete our testing
			didTestPass = true;
		});

		// We don't know exactly when the given container events will fire and we can't await specific events so we have to
		// have a while loop that keeps the test alive until the container notifies us with its event handlers.
		while (!didTestPass) {
			const timeout = async (ms: number): Promise<void> => {
				return new Promise((resolve) => setTimeout(resolve, ms));
			};
			await timeout(25);
		}
	}).timeout(5000);

	it("IFluid container's 'disposed' system event produces expected ContainerDisposedTelemetry using AppInsightsTelemetryConsumer", async () => {
		const { container } = await tinyliciousClient.createContainer(schema);

		const containerId = await container.attach();
		startTelemetry({
			container,
			containerId,
			consumers: [new AppInsightsTelemetryConsumer(appInsightsClient)],
		});

		// Event handler 1: As soon as the container connects, we're ready to initiate a disconnect.
		container.on("connected", () => {
			container.disconnect();
		});

		// Event handler 2: As soon as the container disconnects, we're ready to initiate a dispose.
		container.on("disconnected", () => {
			container.dispose();
		});

		// Event handler 3: capturing and analyzing telemetry after the container disposed event
		let didTestPass = false;
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
				assert.fail(
					"Expected AppInsights.trackEvent() to be called alteast once with expected container telemetry but was not.",
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

			expect(expectedAppInsightsTelemetry).to.deep.equal(actualAppInsightsTelemetry);
			// We won't know what the container containerInstanceId will be but we can still check that it is defined.
			expect(actualContainerTelemetry.containerInstanceId)
				.to.be.a("string")
				.with.length.above(0);

			// This will enable the while loop at the end of this test to finally complete,
			// We  want the test to complete as soon as we recieve the container event and complete our testing
			didTestPass = true;
		});

		// We don't know exactly when the given container events will fire and we can't await specific events so we have to
		// have a while loop that keeps the test alive until the container notifies us with its event handlers.
		while (!didTestPass) {
			const timeout = async (ms: number): Promise<void> => {
				return new Promise((resolve) => setTimeout(resolve, ms));
			};
			await timeout(25);
		}
	}).timeout(5000);
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { ICriticalContainerError } from "@fluidframework/container-definitions";
import type { IFluidContainer, IFluidContainerEvents } from "@fluidframework/fluid-static";
import { ApplicationInsights, type IEventTelemetry } from "@microsoft/applicationinsights-web";
import { expect } from "chai";
import { spy } from "sinon";
import type Sinon from "sinon";

import { IFluidContainerSystemEventNames, type IContainerTelemetry } from "../container/index.js";
import { startTelemetry, type TelemetryConfig } from "../factory/index.js";
import {
	ContainerTelemetryEventNames,
	type ContainerConnectedTelemetry,
	type ContainerDisconnectedTelemetry,
	type ContainerDisposedTelemetry,
	type IFluidTelemetry,
	type ITelemetryConsumer,
} from "../index.js";

/**
 * For these unit tests, we are just interested in the event emitter part of the Fluid container.
 * The rest of the functionality of IFluidContainer is irrelevant.
 */
class MockFluidContainer extends TypedEventEmitter<IFluidContainerEvents> {
	public connect(): void {
		this.emit(IFluidContainerSystemEventNames.CONNECTED);
	}

	public disconnect(): void {
		this.emit(IFluidContainerSystemEventNames.DISCONNECTED);
	}

	public dispose(error?: ICriticalContainerError): void {
		this.emit(IFluidContainerSystemEventNames.DISPOSED, error);
	}
}

describe("container telemetry via", () => {
	let mockFluidContainer: MockFluidContainer;
	const mockContainerId = "mockContainerId";
	let appInsightsClient: ApplicationInsights;
	let trackEventSpy: Sinon.SinonSpy;
	let telemetryConfig: TelemetryConfig;

	beforeEach(() => {
		appInsightsClient = new ApplicationInsights({
			config: {
				connectionString:
					// (this is an example string)
					"InstrumentationKey=abcdefgh-ijkl-mnop-qrst-uvwxyz6ffd9c;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/",
			},
		});

		trackEventSpy = spy(appInsightsClient, "trackEvent");
		mockFluidContainer = new MockFluidContainer();

		class AppInsightsTelemetryConsumer implements ITelemetryConsumer {
			public constructor(private readonly client: ApplicationInsights) {}

			public consume(event: IFluidTelemetry): void {
				this.client.trackEvent({
					name: event.eventName,
					properties: event,
				});
			}
		}

		telemetryConfig = {
			container: mockFluidContainer as unknown as IFluidContainer,
			containerId: mockContainerId,
			consumers: [new AppInsightsTelemetryConsumer(appInsightsClient)],
		};
	});

	it("Emitting 'connected' container system event produces expected ContainerConnectedTelemetry using Azure App Insights", () => {
		startTelemetry(telemetryConfig);

		mockFluidContainer.connect();

		expect(trackEventSpy.callCount).to.equal(1);

		// Obtain the events from the method that the spy was called with
		const actualAppInsightsTelemetry = trackEventSpy.getCall(0).args[0] as IEventTelemetry;
		const actualContainerTelemetry =
			actualAppInsightsTelemetry.properties as IContainerTelemetry;

		const expectedAppInsightsTelemetry: IEventTelemetry = {
			name: ContainerTelemetryEventNames.CONNECTED,
			properties: {
				eventName: ContainerTelemetryEventNames.CONNECTED,
				containerId: mockContainerId,
				containerInstanceId: actualContainerTelemetry.containerInstanceId,
			} satisfies ContainerConnectedTelemetry,
		};

		expect(expectedAppInsightsTelemetry).to.deep.equal(actualAppInsightsTelemetry);
		// We won't know what the container containerInstanceId will be but we can still check that it is defined.
		expect(actualContainerTelemetry.containerInstanceId).to.be.a("string").with.length.above(0);
	});

	it("Emitting 'disconnected' container system event produces expected ContainerDisconnectedTelemetry using Azure App Insights", () => {
		startTelemetry(telemetryConfig);

		mockFluidContainer.disconnect();

		expect(trackEventSpy.callCount).to.equal(1);

		// Obtain the events from the method that the spy was called with
		const actualAppInsightsTelemetry = trackEventSpy.getCall(0).args[0] as IEventTelemetry;
		const actualContainerTelemetry =
			actualAppInsightsTelemetry.properties as IContainerTelemetry;

		const expectedAppInsightsTelemetry: IEventTelemetry = {
			name: ContainerTelemetryEventNames.DISCONNECTED,
			properties: {
				eventName: ContainerTelemetryEventNames.DISCONNECTED,
				containerId: mockContainerId,
				containerInstanceId: actualContainerTelemetry.containerInstanceId,
			} satisfies ContainerDisconnectedTelemetry,
		};

		expect(expectedAppInsightsTelemetry).to.deep.equal(actualAppInsightsTelemetry);
		// We won't know what the container containerInstanceId will be but we can still check that it is defined.
		expect(actualContainerTelemetry.containerInstanceId).to.be.a("string").with.length.above(0);
	});

	it("Emitting 'disposed' system event produces expected ContainerDisposedTelemetry using Azure App Insights", () => {
		startTelemetry(telemetryConfig);

		mockFluidContainer.dispose();

		expect(trackEventSpy.callCount).to.equal(1);

		// Obtain the events from the method that the spy was called with
		const actualAppInsightsTelemetry = trackEventSpy.getCall(0).args[0] as IEventTelemetry;
		const actualContainerTelemetry =
			actualAppInsightsTelemetry.properties as IContainerTelemetry;

		const expectedAppInsightsTelemetry: IEventTelemetry = {
			name: ContainerTelemetryEventNames.DISPOSED,
			properties: {
				eventName: ContainerTelemetryEventNames.DISPOSED,
				containerId: mockContainerId,
				containerInstanceId: actualContainerTelemetry.containerInstanceId,
			} satisfies ContainerDisposedTelemetry,
		};

		expect(expectedAppInsightsTelemetry).to.deep.equal(actualAppInsightsTelemetry);
		// We won't know what the container containerInstanceId will be but we can still check that it is defined.
		expect(actualContainerTelemetry.containerInstanceId).to.be.a("string").with.length.above(0);
	});

	it("Emitting 'disposed' system event with an error produces expected ContainerDisposedTelemetry using Azure App Insights", () => {
		startTelemetry(telemetryConfig);

		const containerError: ICriticalContainerError = {
			errorType: "unknown error",
			message: "An unknown error occured",
			stack: "example stack error at line 52 of Container.ts",
		};

		mockFluidContainer.dispose(containerError);

		// Obtain the events from the method that the spy was called with
		const actualAppInsightsTelemetry = trackEventSpy.getCall(0).args[0] as IEventTelemetry;
		const actualContainerTelemetry =
			actualAppInsightsTelemetry.properties as IContainerTelemetry;

		const expectedAppInsightsTelemetry: IEventTelemetry = {
			name: ContainerTelemetryEventNames.DISPOSED,
			properties: {
				eventName: ContainerTelemetryEventNames.DISPOSED,
				containerId: mockContainerId,
				containerInstanceId: actualContainerTelemetry.containerInstanceId,
				error: containerError,
			} satisfies ContainerDisposedTelemetry,
		};

		expect(expectedAppInsightsTelemetry).to.deep.equal(actualAppInsightsTelemetry);
		// We won't know what the container containerInstanceId will be but we can still check that it is defined.
		expect(actualContainerTelemetry.containerInstanceId).to.be.a("string").with.length.above(0);
	});
});

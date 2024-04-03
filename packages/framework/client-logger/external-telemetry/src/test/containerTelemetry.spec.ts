/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spy, type Sinon } from "sinon";
import { expect } from "chai";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { ICriticalContainerError } from "@fluidframework/container-definitions/internal";
import {
	type IContainer,
	type IContainerEvents,
} from "@fluidframework/container-definitions/internal";
import { startTelemetry, type TelemetryConfig } from "../factory/index.js";
import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { IFluidContainerSystemEventNames } from "../container/containerSystemEvents.js";
import { type IResolvedUrl } from "@fluidframework/driver-definitions/internal";
import { IFluidContainer } from "@fluidframework/fluid-static";
import { createFluidContainer, type IRootDataObject } from "@fluidframework/fluid-static/internal";
import {
	ContainerTelemetryEventNames,
	type ContainerConnectedTelemetry,
	type ContainerDisconnectedTelemetry,
	type ContainerDisposedTelemetry,
	type IFluidTelemetry,
	type ITelemetryConsumer,
} from "../index.js";
/**
 * Mock {@link @fluidframework/container-definitions#IContainer} for use in tests.
 */
class MockContainer
	extends TypedEventEmitter<IContainerEvents>
	implements Partial<Omit<IContainer, "on" | "off" | "once">>
{
	public readonly clientId = "testClientId";
	public readonly resolvedUrl: IResolvedUrl = {
		id: "testDocumentId",
		url: "testUrl",
		type: "fluid",
		tokens: {},
		endpoints: {},
	};

	public connect(): void {
		this.emit(IFluidContainerSystemEventNames.CONNECTED);
	}

	public disconnect(): void {
		this.emit(IFluidContainerSystemEventNames.DISCONNECTED);
	}

	public dispose(error?: ICriticalContainerError): void {
		// IFluidContainer wraps the internal container events and emits its own events that aren't a 1:1 match.
		// In this case, the "closed" event is instead wrapped on IFluidContainer which will emit "disposed" instead.
		this.emit("closed", error);
	}
}

/**
 * Creates a mock {@link @fluidframework/container-definitions#IContainer} for use in tests.
 *
 * @remarks
 *
 * Note: the implementation here is incomplete. If a test needs particular functionality, {@link MockContainer}
 * will need to be updated accordingly.
 */
export function createMockFluidContainer(container: IContainer): IFluidContainer {
	return createFluidContainer({
		container: container,
		rootDataObject: {} as IRootDataObject,
	});
}

describe("External container telemetry", () => {
	let mockContainer: IContainer;
	const mockContainerId = "mockContainerId";
	let mockFluidContainer: IFluidContainer;
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
		mockContainer = new MockContainer() as unknown as IContainer;
		mockFluidContainer = createMockFluidContainer(mockContainer);

		class AppInsightsTelemetryConsumer implements ITelemetryConsumer {
			constructor(private readonly appInsightsClient: ApplicationInsights) {}

			consume(event: IFluidTelemetry) {
				this.appInsightsClient.trackEvent({
					name: event.eventName,
					properties: event,
				});
			}
		}

		telemetryConfig = {
			container: mockFluidContainer,
			containerId: mockContainerId,
			consumers: [new AppInsightsTelemetryConsumer(appInsightsClient)],
		};
	});

	it("Emitting 'connected' container system event produces expected ContainerConnectedTelemetry", () => {
		startTelemetry(telemetryConfig);

		mockContainer.connect();

		expect(trackEventSpy.callCount).to.equal(1);

		// Obtain the events from the method that the spy was called with
		const actualTelemetryEvent = trackEventSpy.getCall(0).args[0];
		const expectedEvent = {
			name: ContainerTelemetryEventNames.CONNECTED,
			properties: {
				eventName: ContainerTelemetryEventNames.CONNECTED,
				containerId: mockContainerId,
				containerInstanceId: actualTelemetryEvent.properties.containerInstanceId,
			} as ContainerConnectedTelemetry,
		};

		expect(expectedEvent).to.deep.equal(actualTelemetryEvent);
		// We won't know what the container containerInstanceId will be but we can still check that it is defined.
		expect(actualTelemetryEvent.properties.containerInstanceId)
			.to.be.a("string")
			.with.length.above(0);
	});

	it("Emitting 'disconnected' container system event produces expected ContainerDisconnectedTelemetry", () => {
		startTelemetry(telemetryConfig);

		mockContainer.disconnect();

		expect(trackEventSpy.callCount).to.equal(1);

		// Obtain the events from the method that the spy was called with
		const actualTelemetryEvent = trackEventSpy.getCall(0).args[0];
		const expectedEvent = {
			name: ContainerTelemetryEventNames.DISCONNECTED,
			properties: {
				eventName: ContainerTelemetryEventNames.DISCONNECTED,
				containerId: mockContainerId,
				containerInstanceId: actualTelemetryEvent.properties.containerInstanceId,
			} as ContainerDisconnectedTelemetry,
		};

		expect(expectedEvent).to.deep.equal(actualTelemetryEvent);
		// We won't know what the container containerInstanceId will be but we can still check that it is defined.
		expect(actualTelemetryEvent.properties.containerInstanceId)
			.to.be.a("string")
			.with.length.above(0);
	});

	it("Emitting 'disposed' system event produces expected ContainerDisposedTelemetry", () => {
		startTelemetry(telemetryConfig);

		mockContainer.dispose();

		expect(trackEventSpy.callCount).to.equal(1);

		// Obtain the events from the method that the spy was called with
		const actualTelemetryEvent = trackEventSpy.getCall(0).args[0];
		const expectedEvent = {
			name: ContainerTelemetryEventNames.DISPOSED,
			properties: {
				eventName: ContainerTelemetryEventNames.DISPOSED,
				containerId: mockContainerId,
				containerInstanceId: actualTelemetryEvent.properties.containerInstanceId,
			} as ContainerDisposedTelemetry,
		};

		expect(expectedEvent).to.deep.equal(actualTelemetryEvent);
		// We won't know what the container containerInstanceId will be but we can still check that it is defined.
		expect(actualTelemetryEvent.properties.containerInstanceId)
			.to.be.a("string")
			.with.length.above(0);
	});

	it("Emitting 'disposed' system event with an error produces expected ContainerDisposedTelemetry", () => {
		startTelemetry(telemetryConfig);

		const containerError: ICriticalContainerError = {
			errorType: "unknown error",
			message: "An unknown error occured",
			stack: "example stack error at line 52 of Container.ts",
		};

		mockContainer.dispose(containerError);

		// Obtain the events from the method that the spy was called with
		const actualTelemetryEvent = trackEventSpy.getCall(0).args[0];

		const expectedEvent = {
			name: ContainerTelemetryEventNames.DISPOSED,
			properties: {
				eventName: ContainerTelemetryEventNames.DISPOSED,
				containerId: mockContainerId,
				containerInstanceId: actualTelemetryEvent.properties.containerInstanceId,
				error: containerError,
			} as ContainerDisposedTelemetry,
		};

		expect(expectedEvent).to.deep.equal(actualTelemetryEvent);
		// We won't know what the container containerInstanceId will be but we can still check that it is defined.
		expect(actualTelemetryEvent.properties.containerInstanceId)
			.to.be.a("string")
			.with.length.above(0);
	});
});

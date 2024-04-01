/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spy, type Sinon } from "sinon";
import { expect } from "chai";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type {
	IContainer,
	IContainerEvents,
	ICriticalContainerError,
} from "@fluidframework/container-definitions";
import { startTelemetry, TelemetryConfig } from "../factory/index.js";
import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { ContainerSystemEventNames } from "../container/containerSystemEvents.js";
import {
	ContainerTelemetryEventNames,
	type ContainerConnectedTelemetry,
} from "../container/index.js";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import type {
	ContainerAttachedTelemetry,
	ContainerAttachingTelemetry,
	ContainerClosedTelemetry,
	ContainerDisconnectedTelemetry,
} from "../container/containerTelemetry.js";
import {
	IFluidContainer,
	createFluidContainer,
	type IRootDataObject,
} from "@fluidframework/fluid-static";
import type { IExternalTelemetry, ITelemetryConsumer } from "../index.js";
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
		this.emit(ContainerSystemEventNames.CONNECTED);
	}

	public disconnect(): void {
		this.emit(ContainerSystemEventNames.DISCONNECTED);
	}

	public async attach(): Promise<void> {
		this.emit(ContainerSystemEventNames.ATTACHING);
		this.emit(ContainerSystemEventNames.ATTACHED);
	}

	public dispose(): void {
		this.emit("disposed");
	}

	public close(error?: ICriticalContainerError): void {
		this.emit(ContainerSystemEventNames.CLOSED, error);
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

			consume(event: IExternalTelemetry) {
				this.appInsightsClient.trackEvent({
					name: event.eventName,
					properties: event,
				});
			}
		}

		telemetryConfig = {
			container: mockFluidContainer,
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
				documentId: mockContainer.resolvedUrl?.id,
				clientId: mockContainer.clientId,
				containerId: actualTelemetryEvent.properties.containerId,
			} as ContainerConnectedTelemetry,
		};

		expect(expectedEvent).to.deep.equal(actualTelemetryEvent);
		// We won't know what the container UUID will be but we can still check that it is defined.
		expect(actualTelemetryEvent.properties.containerId).to.be.a("string").with.length.above(0);
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
				documentId: mockContainer.resolvedUrl?.id,
				clientId: mockContainer.clientId,
				containerId: actualTelemetryEvent.properties.containerId,
			} as ContainerDisconnectedTelemetry,
		};

		expect(expectedEvent).to.deep.equal(actualTelemetryEvent);
		// We won't know what the container UUID will be but we can still check that it is defined.
		expect(actualTelemetryEvent.properties.containerId).to.be.a("string").with.length.above(0);
	});

	it("Emitting 'closed' system event produces expected ContainerClosedTelemetry", () => {
		startTelemetry(telemetryConfig);

		mockContainer.close();

		// Obtain the events from the method that the spy was called with
		const actualTelemetryEvent = trackEventSpy.getCall(0).args[0];
		const expectedEvent = {
			name: ContainerTelemetryEventNames.CLOSED,
			properties: {
				eventName: ContainerTelemetryEventNames.CLOSED,
				documentId: mockContainer.resolvedUrl?.id,
				clientId: mockContainer.clientId,
				containerId: actualTelemetryEvent.properties.containerId,
			} as ContainerClosedTelemetry,
		};

		expect(expectedEvent).to.deep.equal(actualTelemetryEvent);
		// We won't know what the container UUID will be but we can still check that it is defined.
		expect(actualTelemetryEvent.properties.containerId).to.be.a("string").with.length.above(0);
	});

	it("Emitting 'closed' system event with an error produces expected ContainerClosedTelemetry", () => {
		startTelemetry(telemetryConfig);

		const containerError: ICriticalContainerError = {
			errorType: "unknown error",
			message: "An unknown error occured",
			stack: "example stack error at line 52 of Container.ts",
		};

		mockContainer.close(containerError);

		// Obtain the events from the method that the spy was called with
		const actualTelemetryEvent = trackEventSpy.getCall(0).args[0];
		const expectedEvent = {
			name: ContainerTelemetryEventNames.CLOSED,
			properties: {
				eventName: ContainerTelemetryEventNames.CLOSED,
				documentId: mockContainer.resolvedUrl?.id,
				clientId: mockContainer.clientId,
				containerId: actualTelemetryEvent.properties.containerId,
				error: containerError,
			} as ContainerClosedTelemetry,
		};
		expect(expectedEvent).to.deep.equal(actualTelemetryEvent);
		// We won't know what the container UUID will be but we can still check that it is defined.
		expect(actualTelemetryEvent.properties.containerId).to.be.a("string").with.length.above(0);
	});

	it("Emitting 'attaching' system event produces expected ContainerAttachingTelemetry", () => {
		startTelemetry(telemetryConfig);

		mockContainer.attach({ url: "mockUrl" });

		// Obtain the events from the method that the spy was called with
		const actualTelemetryEvent = trackEventSpy.getCall(0).args[0];
		const expectedEvent = {
			name: ContainerTelemetryEventNames.ATTACHING,
			properties: {
				eventName: ContainerTelemetryEventNames.ATTACHING,
				documentId: mockContainer.resolvedUrl?.id,
				clientId: mockContainer.clientId,
				containerId: actualTelemetryEvent.properties.containerId,
			} as ContainerAttachingTelemetry,
		};

		expect(expectedEvent).to.deep.equal(actualTelemetryEvent);
		// We won't know what the container UUID will be but we can still check that it is defined.
		expect(actualTelemetryEvent.properties.containerId).to.be.a("string").with.length.above(0);
	});

	it("Emitting 'attached' system event produces expected ContainerAttachedTelemetry", () => {
		startTelemetry(telemetryConfig);

		mockContainer.attach({ url: "mockUrl" });

		// Obtain the events from the method that the spy was called with
		// Note that due to how our mockContainer is setup, the attached call should be the second call.
		const actualTelemetryEvent = trackEventSpy.getCall(1).args[0];
		const expectedEvent = {
			name: ContainerTelemetryEventNames.ATTACHED,
			properties: {
				eventName: ContainerTelemetryEventNames.ATTACHED,
				documentId: mockContainer.resolvedUrl?.id,
				clientId: mockContainer.clientId,
				containerId: actualTelemetryEvent.properties.containerId,
			} as ContainerAttachedTelemetry,
		};

		expect(expectedEvent).to.deep.equal(actualTelemetryEvent);
		// We won't know what the container UUID will be but we can still check that it is defined.
		expect(actualTelemetryEvent.properties.containerId).to.be.a("string").with.length.above(0);
	});

	it("Emitting multiple events from the same container persists the same containerId in telemetry", () => {
		startTelemetry(telemetryConfig);

		mockContainer.connect();
		mockContainer.disconnect();

		expect(trackEventSpy.callCount).to.equal(2);

		// Obtain the events from the method that the spy was called with
		// Note that due to how our mockContainer is setup, the attached call should be the second call.
		const actualConnectedTelemetryEvent = trackEventSpy.getCall(0).args[0];
		const actualDisconnectedTelemetryEvent = trackEventSpy.getCall(1).args[0];

		// We won't know what the container UUID will be but we can still check that it is defined.
		expect(actualConnectedTelemetryEvent.properties.containerId)
			.to.be.a("string")
			.with.length.above(0);
		// Confirm both events have the same container id.
		expect(actualConnectedTelemetryEvent.properties.containerId).to.equal(
			actualDisconnectedTelemetryEvent.properties.containerId,
		);
	});
});

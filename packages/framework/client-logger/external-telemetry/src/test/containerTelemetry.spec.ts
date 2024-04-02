/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spy, type Sinon } from "sinon";
import { expect } from "chai";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { ICriticalContainerError } from "@fluidframework/container-definitions/internal";
import { IContainer, IContainerEvents } from "@fluidframework/container-definitions/internal";
import { startTelemetry, TelemetryConfig } from "../factory/index.js";
import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { IFluidContainerSystemEventNames } from "../container/containerSystemEvents.js";
import { IResolvedUrl } from "@fluidframework/driver-definitions/internal";
import { IFluidContainer } from "@fluidframework/fluid-static";
import { createFluidContainer, type IRootDataObject } from "@fluidframework/fluid-static/internal";
import {
	ContainerTelemetryEventNames,
	type ContainerConnectedTelemetry,
	type ContainerDisconnectedTelemetry,
	type IExternalTelemetry,
	type ITelemetryConsumer,
} from "../index.js";
import type {
	ContainerDirtyTelemetry,
	ContainerDisposedTelemetry,
	ContainerSavedTelemetry,
} from "../container/containerTelemetry.js";
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
		this.emit(IFluidContainerSystemEventNames.DISPOSED, error);
	}

	public dirty() {
		this.emit(IFluidContainerSystemEventNames.DIRTY);
	}

	public saved() {
		this.emit(IFluidContainerSystemEventNames.SAVED);
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

			consume(event: IExternalTelemetry) {
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
			} as ContainerConnectedTelemetry,
		};

		expect(expectedEvent).to.deep.equal(actualTelemetryEvent);
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
			} as ContainerDisconnectedTelemetry,
		};

		expect(expectedEvent).to.deep.equal(actualTelemetryEvent);
	});

	it("Emitting 'disposed' system event produces expected ContainerClosedTelemetry", () => {
		startTelemetry(telemetryConfig);

		mockContainer.dispose();

		// Obtain the events from the method that the spy was called with
		const actualTelemetryEvent = trackEventSpy.getCall(0).args[0];
		const expectedEvent = {
			name: ContainerTelemetryEventNames.DISPOSED,
			properties: {
				eventName: ContainerTelemetryEventNames.DISPOSED,
				containerId: mockContainerId,
			} as ContainerDisposedTelemetry,
		};

		expect(expectedEvent).to.deep.equal(actualTelemetryEvent);
	});

	it("Emitting 'saved' system event with an error produces expected ContainerClosedTelemetry", () => {
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
			name: ContainerTelemetryEventNames.SAVED,
			properties: {
				eventName: ContainerTelemetryEventNames.SAVED,
				containerId: mockContainerId,
			} as ContainerSavedTelemetry,
		};
		expect(expectedEvent).to.deep.equal(actualTelemetryEvent);
	});

	it("Emitting 'dirty' system event produces expected ContainerAttachingTelemetry", () => {
		startTelemetry(telemetryConfig);

		mockContainer.attach({ url: "mockUrl" });

		// Obtain the events from the method that the spy was called with
		const actualTelemetryEvent = trackEventSpy.getCall(0).args[0];
		const expectedEvent = {
			name: ContainerTelemetryEventNames.DIRTY,
			properties: {
				eventName: ContainerTelemetryEventNames.DIRTY,
				containerId: mockContainerId,
			} as ContainerDirtyTelemetry,
		};

		expect(expectedEvent).to.deep.equal(actualTelemetryEvent);
	});
});

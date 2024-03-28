/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type Sinon from "sinon";
import { assert as sinonAssert, spy } from "sinon";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type {
	IContainer,
	IContainerEvents,
	ICriticalContainerError,
} from "@fluidframework/container-definitions";
import { startTelemetryManagers, TelemetryManagerConfig } from "../factory/index.js";
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
export function createMockContainer(): IContainer {
	return new MockContainer() as unknown as IContainer;
}

describe("External container telemetry", () => {
	let mockContainer: IContainer;
	let appInsightsClient: ApplicationInsights;
	let trackEventSpy: Sinon.SinonSpy;
	let telemetryManagerConfig: TelemetryManagerConfig;

	beforeEach(() => {
		appInsightsClient = new ApplicationInsights({
			config: {
				connectionString:
					// (this is an example string)
					"InstrumentationKey=abcdefgh-ijkl-mnop-qrst-uvwxyz6ffd9c;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/",
			},
		});
		trackEventSpy = spy(appInsightsClient, "trackEvent");
		mockContainer = createMockContainer();

		telemetryManagerConfig = {
			containerTelemetry: {
				container: mockContainer,
			},
			consumers: {
				appInsights: appInsightsClient,
			},
		};
	});

	it("Emitting 'connected' container system event produces expected ContainerConnectedTelemetry", () => {
		startTelemetryManagers(telemetryManagerConfig);

		mockContainer.connect();

		const expectedAppInsightsTelemetryProperties: ContainerConnectedTelemetry = {
			eventName: ContainerTelemetryEventNames.CONNECTED,
			documentId: mockContainer.resolvedUrl?.id,
			containerId: mockContainer.clientId,
		};

		const expectedAppInsightsTelemetry = {
			name: ContainerTelemetryEventNames.CONNECTED,
			properties: expectedAppInsightsTelemetryProperties,
		};

		sinonAssert.calledWith(trackEventSpy, expectedAppInsightsTelemetry);
	});

	it("Emitting 'disconnected' container system event produces expected ContainerDisconnectedTelemetry", () => {
		startTelemetryManagers(telemetryManagerConfig);

		mockContainer.disconnect();

		const expectedAppInsightsTelemetryProperties: ContainerDisconnectedTelemetry = {
			eventName: ContainerTelemetryEventNames.DISCONNECTED,
			documentId: mockContainer.resolvedUrl?.id,
			containerId: mockContainer.clientId,
		};

		const expectedAppInsightsTelemetry = {
			name: ContainerTelemetryEventNames.DISCONNECTED,
			properties: expectedAppInsightsTelemetryProperties,
		};

		sinonAssert.calledWith(trackEventSpy, expectedAppInsightsTelemetry);
	});

	it("Emitting 'closed' system event produces expected ContainerClosedTelemetry", () => {
		startTelemetryManagers(telemetryManagerConfig);

		mockContainer.close();

		const expectedAppInsightsTelemetryProperties: ContainerClosedTelemetry = {
			eventName: ContainerTelemetryEventNames.CLOSED,
			documentId: mockContainer.resolvedUrl?.id,
			containerId: mockContainer.clientId,
		};

		const expectedAppInsightsTelemetry = {
			name: ContainerTelemetryEventNames.CLOSED,
			properties: expectedAppInsightsTelemetryProperties,
		};

		sinonAssert.calledWith(trackEventSpy, expectedAppInsightsTelemetry);
	});

	it("Emitting 'closed' system event with an error produces expected ContainerClosedTelemetry", () => {
		startTelemetryManagers(telemetryManagerConfig);

		const containerError: ICriticalContainerError = {
			errorType: "unknown error",
			message: "An unknown error occured",
			stack: "example stack error at line 52 of Container.ts",
		};

		mockContainer.close(containerError);

		const expectedAppInsightsTelemetryProperties: ContainerClosedTelemetry = {
			eventName: ContainerTelemetryEventNames.CLOSED,
			documentId: mockContainer.resolvedUrl?.id,
			containerId: mockContainer.clientId,
			error: containerError,
		};

		const expectedAppInsightsTelemetry = {
			name: ContainerTelemetryEventNames.CLOSED,
			properties: expectedAppInsightsTelemetryProperties,
		};

		sinonAssert.calledWith(trackEventSpy, expectedAppInsightsTelemetry);
	});

	it("Emitting 'attaching' system event produces expected ContainerAttachingTelemetry", () => {
		startTelemetryManagers(telemetryManagerConfig);

		mockContainer.attach({ url: "mockUrl" });

		const expectedAppInsightsTelemetryProperties: ContainerAttachingTelemetry = {
			eventName: ContainerTelemetryEventNames.ATTACHING,
			documentId: mockContainer.resolvedUrl?.id,
			containerId: mockContainer.clientId,
		};

		const expectedAppInsightsTelemetry = {
			name: ContainerTelemetryEventNames.ATTACHING,
			properties: expectedAppInsightsTelemetryProperties,
		};

		sinonAssert.calledWith(trackEventSpy, expectedAppInsightsTelemetry);
	});

	it("Emitting 'attached' system event produces expected ContainerAttachedTelemetry", () => {
		startTelemetryManagers(telemetryManagerConfig);

		mockContainer.attach({ url: "mockUrl" });

		const expectedAppInsightsTelemetryProperties: ContainerAttachedTelemetry = {
			eventName: ContainerTelemetryEventNames.ATTACHED,
			documentId: mockContainer.resolvedUrl?.id,
			containerId: mockContainer.clientId,
		};

		const expectedAppInsightsTelemetry = {
			name: ContainerTelemetryEventNames.ATTACHED,
			properties: expectedAppInsightsTelemetryProperties,
		};

		sinonAssert.calledWith(trackEventSpy, expectedAppInsightsTelemetry);
	});
});

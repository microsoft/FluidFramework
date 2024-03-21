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
import {
	createTelemetryManagers,
	type AppInsightsTelemetryConsumerConfig,
	type TelemetryManagerConfig,
} from "../factory";
import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { ContainerSystemEventNames } from "../container/containerSystemEvents";
import { ContainerTelemetryEventNames, type ContainerConnectedTelemetry } from "../container";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import type {
	ContainerClosedTelemetry,
	ContainerDisconnectedTelemetry,
} from "../container/containerTelemetry";

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
		this.emit("attached");
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

		const consumerConfig: AppInsightsTelemetryConsumerConfig = {
			type: "AppInsights",
			appInsightsClient,
		};
		telemetryManagerConfig = {
			containerTelemetry: {
				container: mockContainer,
				consumerConfig: consumerConfig,
			},
		};
	});

	it("Emitting 'connected' container system event produces expected ContainerConnectedTelemetry", () => {
		createTelemetryManagers(telemetryManagerConfig);

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
		createTelemetryManagers(telemetryManagerConfig);

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
		createTelemetryManagers(telemetryManagerConfig);

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
		createTelemetryManagers(telemetryManagerConfig);

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
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer, type ICriticalContainerError } from "@fluidframework/container-definitions";
import { IContainerTelemetry } from "./containerTelemetry";
import { ContainerEventTelemetryProducer } from "./telemetryProducer";
import { ITelemetryConsumer } from "../common";
import { ContainerSystemEventName, ContainerSystemEventNames } from "./containerSystemEvents";

/**
 * This class manages container telemetry intended for customers to consume.
 * It manages subcribing to the proper raw container system events, sending them to the {@link ContainerEventTelemetryProducer}
 * to be transformed into {@link IContainerTelemetry} and finally sending them to the provided {@link ITelemetryConsumer}
 */
export class ContainerTelemetryManager {
	constructor(
		private readonly container: IContainer,
		private readonly telemetryProducer: ContainerEventTelemetryProducer,
		private readonly telemetryConsumer: ITelemetryConsumer,
	) {
		this.setupEventHandlers(this.container);
	}

	/**
	 * Subscribes to the raw container system events and routes them to telemetry producers.
	 */
	private setupEventHandlers(container: IContainer) {
		container.on(ContainerSystemEventNames.CONNECTED, (clientId) =>
			this.handleContainerSystemEvent(ContainerSystemEventNames.CONNECTED, { clientId }),
		);
		container.on(ContainerSystemEventNames.DISCONNECTED, () =>
			this.handleContainerSystemEvent(ContainerSystemEventNames.DISCONNECTED),
		);
		container.on(ContainerSystemEventNames.CLOSED, (error?: ICriticalContainerError) =>
			this.handleContainerSystemEvent(ContainerSystemEventNames.CLOSED, { error }),
		);
	}

	/**
	 * Handles the incoming raw container sysytem event, sending it to the {@link ContainerEventTelemetryProducer} to
	 * produce {@link IContainerTelemetry} and sending it to the {@link ITelemetryConsumer} to be consumed.
	 */
	private handleContainerSystemEvent(eventName: ContainerSystemEventName, payload?: any) {
		const telemetry: IContainerTelemetry | undefined = this.telemetryProducer.produceTelemetry(
			eventName,
			payload,
		);

		if (telemetry !== undefined) {
			this.telemetryConsumer.consume(telemetry);
		}
	}
}

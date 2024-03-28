/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer, type ICriticalContainerError } from "@fluidframework/container-definitions";
import { IContainerTelemetry } from "./containerTelemetry.js";
import { ContainerEventTelemetryProducer } from "./telemetryProducer.js";
import { ITelemetryConsumer } from "../common/index.js";
import { ContainerSystemEventName, ContainerSystemEventNames } from "./containerSystemEvents.js";
import { v4 as uuid } from "uuid";
/**
 * This class manages container telemetry intended for customers to consume.
 * It manages subcribing to the proper raw container system events, sending them to the {@link ContainerEventTelemetryProducer}
 * to be transformed into {@link IContainerTelemetry} and finally sending them to the provided {@link ITelemetryConsumer}
 *
 * @internal
 */
export class ContainerTelemetryManager {
	private readonly containerId: string;

	constructor(
		private readonly container: IContainer,
		private readonly telemetryProducer: ContainerEventTelemetryProducer,
		private readonly telemetryConsumers: ITelemetryConsumer[],
	) {
		this.setupEventHandlers();
		this.containerId = uuid();
	}

	/**
	 * Subscribes to the raw container system events and routes them to telemetry producers.
	 */
	private setupEventHandlers() {
		this.container.on(ContainerSystemEventNames.CONNECTED, (clientId) =>
			this.handleContainerSystemEvent(ContainerSystemEventNames.CONNECTED, { clientId }),
		);
		this.container.on(ContainerSystemEventNames.DISCONNECTED, () =>
			this.handleContainerSystemEvent(ContainerSystemEventNames.DISCONNECTED),
		);
		this.container.on(ContainerSystemEventNames.CLOSED, (error?: ICriticalContainerError) =>
			this.handleContainerSystemEvent(ContainerSystemEventNames.CLOSED, { error }),
		);
		this.container.on(ContainerSystemEventNames.ATTACHED, () =>
			this.handleContainerSystemEvent(ContainerSystemEventNames.ATTACHED),
		);
		this.container.on(ContainerSystemEventNames.ATTACHING, () =>
			this.handleContainerSystemEvent(ContainerSystemEventNames.ATTACHING),
		);
	}

	/**
	 * Handles the incoming raw container sysytem event, sending it to the {@link ContainerEventTelemetryProducer} to
	 * produce {@link IContainerTelemetry} and sending it to the {@link ITelemetryConsumer} to be consumed.
	 */
	private handleContainerSystemEvent(eventName: ContainerSystemEventName, payload?: unknown) {
		const telemetry: IContainerTelemetry | undefined = this.telemetryProducer.produceTelemetry(
			eventName,
			this.containerId,
			payload,
		);

		if (telemetry !== undefined) {
			this.telemetryConsumers.forEach((consumer) => consumer.consume(telemetry));
		}
	}
}

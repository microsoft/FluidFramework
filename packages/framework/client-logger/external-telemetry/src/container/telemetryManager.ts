/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ICriticalContainerError } from "@fluidframework/container-definitions";
import { IContainerTelemetry, type ContainerHeartbeatTelemetry } from "./containerTelemetry.js";
import { ContainerEventTelemetryProducer } from "./telemetryProducer.js";
import { ITelemetryConsumer } from "../common/index.js";
import {
	IFluidContainerSystemEventName,
	IFluidContainerSystemEventNames,
} from "./containerSystemEvents.js";
import type { IFluidContainer } from "@fluidframework/fluid-static";

/**
 * This class manages container telemetry intended for customers to consume by wiring together the provided container system events, telemetry producers and consumers together.
 * It manages subcribing to the proper raw container system events, sending them to the {@link ContainerEventTelemetryProducer}
 * to be transformed into {@link IContainerTelemetry} and finally sending them to the provided {@link ITelemetryConsumer}
 *
 * @internal
 */
export class ContainerTelemetryManager {
	private static HEARTBEAT_EMISSION_INTERNAL_MS = 60000;

	constructor(
		private readonly container: IFluidContainer,
		private readonly telemetryProducer: ContainerEventTelemetryProducer,
		private readonly telemetryConsumers: ITelemetryConsumer[],
	) {
		this.setupEventHandlers();
		this.setupHeartbeatTelemetryEmission();
	}

	/**
	 * Subscribes to the raw container system events and routes them to telemetry producers.
	 */
	private setupEventHandlers() {
		this.container.on(IFluidContainerSystemEventNames.CONNECTED, () =>
			this.handleContainerSystemEvent(IFluidContainerSystemEventNames.CONNECTED),
		);
		this.container.on(IFluidContainerSystemEventNames.DISCONNECTED, () =>
			this.handleContainerSystemEvent(IFluidContainerSystemEventNames.DISCONNECTED),
		);
		this.container.on(
			IFluidContainerSystemEventNames.DISPOSED,
			(error?: ICriticalContainerError) =>
				this.handleContainerSystemEvent(IFluidContainerSystemEventNames.DISPOSED, {
					error,
				}),
		);
	}

	/**
	 * Sets up the synthetic container heartbeat telemetry to be emitted on a given time interval.
	 */
	private setupHeartbeatTelemetryEmission() {
		const createAndConsumeHeartbeatTelemetry = () => {
			const telemetry: ContainerHeartbeatTelemetry =
				this.telemetryProducer.produceHeartbeatTelemetry();
			this.telemetryConsumers.forEach((consumer) => consumer.consume(telemetry));
		};
		setInterval(
			createAndConsumeHeartbeatTelemetry,
			ContainerTelemetryManager.HEARTBEAT_EMISSION_INTERNAL_MS,
		);
	}

	/**
	 * Handles the incoming raw container sysytem event, sending it to the {@link ContainerEventTelemetryProducer} to
	 * produce {@link IContainerTelemetry} and sending it to the {@link ITelemetryConsumer} to be consumed.
	 */
	private handleContainerSystemEvent(
		eventName: IFluidContainerSystemEventName,
		payload?: unknown,
	) {
		const telemetry: IContainerTelemetry | undefined =
			this.telemetryProducer.produceFromSystemEvent(eventName, payload);

		if (telemetry !== undefined) {
			this.telemetryConsumers.forEach((consumer) => consumer.consume(telemetry));
		}
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ICriticalContainerError } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import type { IFluidContainer } from "@fluidframework/fluid-static";

import { type ITelemetryConsumer } from "../common/index.js";

import {
	type IFluidContainerSystemEventName,
	IFluidContainerSystemEventNames,
} from "./containerSystemEvents.js";
import { type IContainerTelemetry } from "./containerTelemetry.js";
import type { ContainerEventTelemetryProducer } from "./telemetryProducer.js";

/**
 * This class manages container telemetry intended for customers to consume by wiring together the provided container system events, telemetry producers and consumers together.
 * It manages subcribing to the proper raw container system events, sending them to the {@link ContainerEventTelemetryProducer}
 * to be transformed into {@link IContainerTelemetry} and finally sending them to the provided {@link ITelemetryConsumer}
 */
export class ContainerTelemetryManager {
	private static readonly HEARTBEAT_EMISSION_INTERNAL_MS = 60000;

	public constructor(
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
	private setupEventHandlers(): void {
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
	 * Sets up the synthetic telemetry event for the container heartbeat telemetry to be emitted on a given time interval
	 * if and only if the container is in a "connected" state. It is used to keep a pulse check on a live container
	 */
	private setupHeartbeatTelemetryEmission(): void {
		setInterval(() => {
			if (this.container.connectionState === ConnectionState.Connected) {
				const telemetry = this.telemetryProducer.produceHeartbeatTelemetry();
				for (const consumer of this.telemetryConsumers) {
					consumer.consume(telemetry);
				}
			}
		}, ContainerTelemetryManager.HEARTBEAT_EMISSION_INTERNAL_MS);
	}

	/**
	 * Handles the incoming raw container sysytem event, sending it to the {@link ContainerEventTelemetryProducer} to
	 * produce {@link IContainerTelemetry} and sending it to the {@link ITelemetryConsumer} to be consumed.
	 */
	private handleContainerSystemEvent(
		eventName: IFluidContainerSystemEventName,
		payload?: unknown,
	): void {
		const telemetry: IContainerTelemetry | undefined =
			this.telemetryProducer.produceFromSystemEvent(eventName, payload);

		if (telemetry !== undefined) {
			for (const consumer of this.telemetryConsumers) {
				consumer.consume(telemetry);
			}
		}
	}
}

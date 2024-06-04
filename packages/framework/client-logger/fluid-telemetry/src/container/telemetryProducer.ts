/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ICriticalContainerError } from "@fluidframework/container-definitions";
import { v4 as uuid } from "uuid";

import type { IFluidTelemetry } from "../index.js";

import {
	type IFluidContainerSystemEventName,
	IFluidContainerSystemEventNames,
} from "./containerSystemEvents.js";
import {
	ContainerTelemetryEventNames,
	type ContainerTelemetryEventName,
	type IContainerTelemetry,
	type ContainerDisposedTelemetry,
} from "./containerTelemetry.js";

/**
 * This class produces {@link IContainerTelemetry} from raw container system events {@link @fluidframework/fluid-static#IFluidContainerEvents}.
 * The class contains different helper methods for simplifying and standardizing logic for adding additional information necessary
 * to produce different {@link IContainerTelemetry}.
 */
export class ContainerEventTelemetryProducer {
	/**
	 * Unique identifier for the instance of the container that this class is generating telemetry for.
	 */
	private readonly containerInstanceId = uuid();

	public constructor(private readonly containerId: string) {}

	public produceFromSystemEvent(
		eventName: IFluidContainerSystemEventName,
		payload?: unknown,
	): IContainerTelemetry | undefined {
		switch (eventName) {
			case IFluidContainerSystemEventNames.CONNECTED: {
				return this.produceBaseContainerTelemetry(ContainerTelemetryEventNames.CONNECTED);
			}
			case IFluidContainerSystemEventNames.DISCONNECTED: {
				return this.produceBaseContainerTelemetry(
					ContainerTelemetryEventNames.DISCONNECTED,
				);
			}
			case IFluidContainerSystemEventNames.DISPOSED: {
				const typedPayload = payload as { error?: ICriticalContainerError };
				return this.produceDiposedTelemetry(typedPayload);
			}
			default: {
				break;
			}
		}
	}

	public produceHeartbeatTelemetry = (): IFluidTelemetry => {
		return {
			eventName: "fluidframework.container.heartbeat",
			containerId: this.containerId,
			containerInstanceId: this.containerInstanceId,
		} as unknown as IFluidTelemetry;
	};

	private readonly produceBaseContainerTelemetry = (
		eventName: ContainerTelemetryEventName,
	): IContainerTelemetry => {
		return {
			eventName,
			containerId: this.containerId,
			containerInstanceId: this.containerInstanceId,
		} satisfies IContainerTelemetry;
	};

	private readonly produceDiposedTelemetry = (payload?: {
		error?: ICriticalContainerError;
	}): ContainerDisposedTelemetry => {
		const telemetry: ContainerDisposedTelemetry = {
			eventName: ContainerTelemetryEventNames.DISPOSED,
			containerId: this.containerId,
			containerInstanceId: this.containerInstanceId,
		};
		if (payload?.error !== undefined) {
			telemetry.error = payload.error;
		}
		return telemetry;
	};
}

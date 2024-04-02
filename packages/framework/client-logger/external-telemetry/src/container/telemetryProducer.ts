/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ICriticalContainerError } from "@fluidframework/container-definitions";
import {
	ContainerTelemetryEventNames,
	type ContainerTelemetryEventName,
	type IContainerTelemetry,
	type ContainerDisposedTelemetry,
} from "./containerTelemetry.js";
import {
	type IFluidContainerSystemEventName,
	IFluidContainerSystemEventNames,
} from "./containerSystemEvents.js";

/**
 * This class produces {@link IContainerTelemetry} from raw container system events {@link @fluidframework/fluid-static#IFluidContainerEvents}.
 * The class contains different helper methods for simplifying and standardizing logic for adding additional information necessary
 * to produce different {@link IContainerTelemetry}.
 *
 * @internal
 */
export class ContainerEventTelemetryProducer {
	constructor(private readonly containerId: string) {}

	public produceTelemetry(
		eventName: IFluidContainerSystemEventName,
		payload?: any,
	): IContainerTelemetry | undefined {
		switch (eventName) {
			case IFluidContainerSystemEventNames.CONNECTED:
				return this.produceBaseContainerTelemetry(ContainerTelemetryEventNames.CONNECTED);
			case IFluidContainerSystemEventNames.DISCONNECTED:
				return this.produceBaseContainerTelemetry(
					ContainerTelemetryEventNames.DISCONNECTED,
				);
			case IFluidContainerSystemEventNames.DIRTY:
				return this.produceBaseContainerTelemetry(ContainerTelemetryEventNames.DIRTY);
			case IFluidContainerSystemEventNames.SAVED:
				return this.produceBaseContainerTelemetry(ContainerTelemetryEventNames.SAVED);
			case IFluidContainerSystemEventNames.DISPOSED:
				return this.produceDiposedTelemetry(payload);
			default:
				break;
		}
	}

	private produceBaseContainerTelemetry = (
		eventName: ContainerTelemetryEventName,
	): IContainerTelemetry => {
		return {
			eventName,
			containerId: this.containerId,
		} as IContainerTelemetry;
	};

	private produceDiposedTelemetry = (payload?: {
		error?: ICriticalContainerError;
	}): ContainerDisposedTelemetry => {
		const telemetry: ContainerDisposedTelemetry = {
			eventName: ContainerTelemetryEventNames.DISPOSED,
			containerId: this.containerId,
		};
		if (payload?.error !== undefined) {
			telemetry.error = payload.error;
		}
		return telemetry;
	};
}

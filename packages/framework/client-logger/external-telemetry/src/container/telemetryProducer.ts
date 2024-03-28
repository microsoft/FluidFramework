/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IContainer,
	IContainerEvents,
	type ICriticalContainerError,
} from "@fluidframework/container-definitions";
import {
	ContainerConnectedTelemetry,
	ContainerTelemetryEventNames,
	IContainerTelemetry,
	ContainerClosedTelemetry,
	type ContainerTelemetryEventName,
} from "./containerTelemetry.js";
import { ContainerSystemEventName, ContainerSystemEventNames } from "./containerSystemEvents.js";

/**
 * This class produces {@link IContainerTelemetry} from raw container system events {@link IContainerEvents}.
 * The class contains different helper methods for simplifying and standardizing logic for adding additional information necessary
 * to produce different {@link IContainerTelemetry}.
 *
 * @internal
 */
export class ContainerEventTelemetryProducer {
	constructor(private container: IContainer) {}

	public produceTelemetry(
		eventName: ContainerSystemEventName,
		payload?: any,
	): IContainerTelemetry | undefined {
		let telemetry: IContainerTelemetry | undefined = undefined;
		switch (eventName) {
			case ContainerSystemEventNames.CONNECTED:
				return this.produceConnectedTelemetry(payload);
			case ContainerSystemEventNames.DISCONNECTED:
				return this.produceBasicContainerTelemetry(
					ContainerTelemetryEventNames.DISCONNECTED,
				);
			case ContainerSystemEventNames.CLOSED:
				return this.produceClosedTelemetry(payload);
			case ContainerSystemEventNames.ATTACHED:
				return this.produceBasicContainerTelemetry(ContainerTelemetryEventNames.ATTACHED);
			case ContainerSystemEventNames.ATTACHING:
				return this.produceBasicContainerTelemetry(ContainerTelemetryEventNames.ATTACHING);
			default:
				break;
		}
		return telemetry;
	}

	private produceBasicContainerTelemetry = (
		eventName: ContainerTelemetryEventName,
	): IContainerTelemetry => {
		return {
			eventName,
			containerId: this.getClientId(),
			documentId: this.getDocumentId(),
		} as IContainerTelemetry;
	};

	private produceConnectedTelemetry = (payload?: {
		clientId: string;
	}): ContainerConnectedTelemetry => {
		return {
			eventName: ContainerTelemetryEventNames.CONNECTED,
			containerId: payload?.clientId ?? this.getClientId(),
			documentId: this.getDocumentId(),
		};
	};

	private produceClosedTelemetry = (payload?: {
		error?: ICriticalContainerError;
	}): ContainerClosedTelemetry => {
		const telemetry: ContainerClosedTelemetry = {
			eventName: ContainerTelemetryEventNames.CLOSED,
			containerId: this.getClientId(),
			documentId: this.getDocumentId(),
		};
		if (payload?.error !== undefined) {
			telemetry.error = payload.error;
		}
		return telemetry;
	};

	private getClientId(): string | undefined {
		return this.container.clientId;
	}

	private getDocumentId(): string | undefined {
		return this.container.resolvedUrl?.id;
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IContainer,
	type IContainerEvents,
	type ICriticalContainerError,
} from "@fluidframework/container-definitions/internal";
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
		containerId: string,
		payload?: any,
	): IContainerTelemetry | undefined {
		switch (eventName) {
			case ContainerSystemEventNames.CONNECTED:
				return this.produceConnectedTelemetry(containerId, payload);
			case ContainerSystemEventNames.DISCONNECTED:
				return this.produceBasicContainerTelemetry(
					ContainerTelemetryEventNames.DISCONNECTED,
					containerId,
				);
			case ContainerSystemEventNames.CLOSED:
				return this.produceClosedTelemetry(containerId, payload);
			case ContainerSystemEventNames.ATTACHED:
				return this.produceBasicContainerTelemetry(
					ContainerTelemetryEventNames.ATTACHED,
					containerId,
				);
			case ContainerSystemEventNames.ATTACHING:
				return this.produceBasicContainerTelemetry(
					ContainerTelemetryEventNames.ATTACHING,
					containerId,
				);
			default:
				break;
		}
	}

	private produceBasicContainerTelemetry = (
		eventName: ContainerTelemetryEventName,
		containerId: string,
	): IContainerTelemetry => {
		return {
			eventName,
			containerId,
			clientId: this.getClientId(),
			documentId: this.getDocumentId(),
		} as IContainerTelemetry;
	};

	private produceConnectedTelemetry = (
		containerId: string,
		payload?: {
			clientId: string;
		},
	): ContainerConnectedTelemetry => {
		return {
			eventName: ContainerTelemetryEventNames.CONNECTED,
			containerId,
			clientId: payload?.clientId ?? this.getClientId(),
			documentId: this.getDocumentId(),
		};
	};

	private produceClosedTelemetry = (
		containerId: string,
		payload?: {
			error?: ICriticalContainerError;
		},
	): ContainerClosedTelemetry => {
		const telemetry: ContainerClosedTelemetry = {
			eventName: ContainerTelemetryEventNames.CLOSED,
			containerId,
			clientId: this.getClientId(),
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

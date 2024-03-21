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
	type ContainerDisconnectedTelemetry,
	type ContainerClosedTelemetry,
} from "./containerTelemetry";
import { ContainerSystemEventName, ContainerSystemEventNames } from "./containerSystemEvents";

/**
 * This class produces {@link IContainerTelemetry} from raw container system events {@link IContainerEvents}.
 * The class contains different helper methods for simplifying and standardizing logic for adding additional information necessary
 * to produce different {@link IContainerTelemetry}.
 *
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
				telemetry = this.produceConnectedTelemetry(payload);
				return telemetry;
			case ContainerSystemEventNames.DISCONNECTED:
				telemetry = this.produceDisconnectedTelemetry();
				break;
			case ContainerSystemEventNames.CLOSED:
				telemetry = this.produceClosedTelemetry(payload);
				break;
			default:
				break;
		}
		return telemetry;
	}

	private produceConnectedTelemetry = (payload?: {
		clientId: string;
	}): ContainerConnectedTelemetry => {
		return {
			eventName: ContainerTelemetryEventNames.CONNECTED,
			containerId: payload?.clientId ?? this.getContainerId(),
			documentId: this.getDocumentId(),
		};
	};

	private produceDisconnectedTelemetry = (): ContainerDisconnectedTelemetry => {
		return {
			eventName: ContainerTelemetryEventNames.DISCONNECTED,
			containerId: this.getContainerId(),
			documentId: this.getDocumentId(),
		};
	};

	private produceClosedTelemetry = (payload?: {
		error?: ICriticalContainerError;
	}): ContainerClosedTelemetry => {
		const telemetry: ContainerClosedTelemetry = {
			eventName: ContainerTelemetryEventNames.CLOSED,
			containerId: this.getContainerId(),
			documentId: this.getDocumentId(),
		};
		if (payload?.error !== undefined) {
			telemetry.error = payload.error;
		}
		return telemetry;
	};

	private getContainerId(): string | undefined {
		return this.container.clientId;
	}

	private getDocumentId(): string | undefined {
		return this.container.resolvedUrl?.id;
	}
}

export interface ContainerTelemetryProducer {
	(payload?: any): IContainerTelemetry;
}

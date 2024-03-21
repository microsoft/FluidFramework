/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IExternalTelemetry } from "../common";
import { IContainer, type ICriticalContainerError } from "@fluidframework/container-definitions";

/**
 * This file contains the types for container telemetry that can be produced.
 */

/**
 * This object contains names for Container Telemetry. Unlike the raw container system event names they contain more information such as the scope
 *
 */
export const ContainerTelemetryEventNames = {
	/**
	 * Name for the container telemetry event that is intended to be produced from the internal container "connected" system event
	 *
	 * @see {@link ContainerConnectedTelemetry}
	 */
	CONNECTED: "container.connected",
	/**
	 * Name for the container telemetry event that is intended to be produced from the internal container "disconnected" system event
	 *
	 * @see {@link ContainerDisconnectedTelemetry}
	 */
	DISCONNECTED: "container.disconnected",
	/**
	 * Name for the container telemetry event that is intended to be produced from the internal container "closed" system event
	 *
	 * @see {@link ContainerClosedTelemetry}
	 */
	CLOSED: "container.closed",
} as const;

/**
 * The type for all values within {@link ContainerTelemetryEventNames}
 */
export type ContainerTelemetryEventName =
	(typeof ContainerTelemetryEventNames)[keyof typeof ContainerTelemetryEventNames];

/**
 * The base interface for all Container telemetry
 */
export interface IContainerTelemetry extends IExternalTelemetry {
	eventName: ContainerTelemetryEventName;
	containerId?: string;
	documentId?: string;
}

/**
 * The container "connected" telemetry event.
 * It is produced from an internal Fluid container system event {@link IContainerEvents} which is emitted when the {@link IContainer} completes connecting to the Fluid service.
 *
 * @remarks Reflects connection state changes against the (delta) service acknowledging ops/edits.
 *
 * @see
 *
 * - {@link IContainer.connectionState}
 *
 * - {@link IContainer.connect}
 * @see {@link IContainer.connectionState}
 *
 */
export interface ContainerConnectedTelemetry extends IContainerTelemetry {
	eventName: "container.connected";
}

/**
 * The container "disconnected" telemetry event.
 * This telemetry is produced from an internal Fluid container system event {@link IContainerEvents} which is
 * emitted when the {@link IContainer} becomes disconnected from the Fluid service.
 *
 * @remarks Reflects connection state changes against the (delta) service acknowledging ops/edits.
 *
 * @see
 *
 * - {@link IContainer.connectionState}
 *
 * - {@link IContainer.disconnect}
 */
export interface ContainerDisconnectedTelemetry extends IContainerTelemetry {
	eventName: "container.disconnected";
}

/**
 * The container "closed" telemetry event.
 * This telemetry is produced from an internal Fluid container system event {@link IContainerEvents} that is
 * Emitted when the {@link IContainer} is closed, which permanently disables it.
 *
 * @remarks Listener parameters:
 *
 * - `error`: If the container was closed due to error, this will contain details about the error that caused it.
 *
 * @see {@link IContainer.close}
 */
export interface ContainerClosedTelemetry extends IContainerTelemetry {
	eventName: "container.closed";
	error?: ICriticalContainerError;
}

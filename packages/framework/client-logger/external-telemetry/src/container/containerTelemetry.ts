/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IExternalTelemetry } from "../common/index.js";
import { ICriticalContainerError } from "@fluidframework/container-definitions";

/**
 * This file contains the types for container telemetry that can be produced.
 */

/**
 * This object contains names for Container Telemetry. Unlike the raw container system event names they contain more information such as the scope
 *
 * @beta
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
	/**
	 * Name for the container telemetry event that is intended to be produced from the internal container "attaching" system event
	 *
	 * @see {@link ContainerAttachingTelemetry}
	 */
	ATTACHING: "container.attaching",
	/**
	 * Name for the container telemetry event that is intended to be produced from the internal container "attached" system event
	 *
	 * @see {@link ContainerAttachedTelemetry}
	 */
	ATTACHED: "container.attached",
} as const;

/**
 * The type for all values within {@link ContainerTelemetryEventNames}
 * @beta
 */
export type ContainerTelemetryEventName =
	(typeof ContainerTelemetryEventNames)[keyof typeof ContainerTelemetryEventNames];

/**
 * The base interface for all Container telemetry
 * @beta
 */
export interface IContainerTelemetry extends IExternalTelemetry {
	eventName: ContainerTelemetryEventName;
	containerId: string;
	clientId?: string;
	documentId?: string;
}

/**
 * The container "connected" telemetry event.
 * It is produced from an internal Fluid container system event {@link @fluidframework/container-definitions#IContainerEvents} which is emitted when the {@link @fluidframework/container-definitions#IContainer} completes connecting to the Fluid service.
 *
 * @remarks Reflects connection state changes against the (delta) service acknowledging ops/edits.
 *
 * @see
 *
 * - {@link @fluidframework/container-definitions#IContainer.connectionState}
 *
 * - {@link @fluidframework/container-definitions#IContainer.connect}
 * @see {@link @fluidframework/container-definitions#IContainer.connectionState}
 *
 * @beta
 */
export interface ContainerConnectedTelemetry extends IContainerTelemetry {
	eventName: "container.connected";
}

/**
 * The container "disconnected" telemetry event. This telemetry is produced from an internal Fluid container system event
 * {@link @fluidframework/container-definitions#IContainerEvents} which is emitted when the {@link @fluidframework/container-definitions#IContainer}
 * becomes disconnected from the Fluid service.
 *
 * @remarks Reflects connection state changes against the (delta) service acknowledging ops/edits.
 *
 * @see
 *
 * - {@link @fluidframework/container-definitions#IContainer.connectionState}
 *
 * - {@link @fluidframework/container-definitions#IContainer.disconnect}
 *
 * @beta
 */
export interface ContainerDisconnectedTelemetry extends IContainerTelemetry {
	eventName: "container.disconnected";
}

/**
 * The container "closed" telemetry event. This telemetry is produced from an internal Fluid container system event
 * {@link @fluidframework/container-definitions#IContainerEvents} which is emitted when the {@link @fluidframework/container-definitions#IContainer}
 * is closed, which permanently disables the container.
 *
 * @remarks Listener parameters:
 *
 * - `error`: If the container was closed due to error, this will contain details about the error that caused it.
 *
 * @see {@link @fluidframework/container-definitions#IContainer.close}
 *
 * @beta
 */
export interface ContainerClosedTelemetry extends IContainerTelemetry {
	eventName: "container.closed";
	error?: ICriticalContainerError;
}

/**
 * The container "attaching" telemetry event. This telemetry is produced from an internal Fluid container system event
 * {@link @fluidframework/container-definitions#IContainerEvents} which is emitted when the {@link @fluidframework/container-definitions#IContainer}'s
 * {@link @fluidframework/container-definitions#AttachState.Attaching | attaching} process is complete and the container is {@link @fluidframework/container-definitions#AttachState.Attached | attached} to the Fluid service.
 *
 * @see
 *
 * - {@link @fluidframework/container-definitions#IContainer.attachState}
 *
 * - {@link @fluidframework/container-definitions#IContainer.attach}
 *
 * @beta
 */
export interface ContainerAttachingTelemetry extends IContainerTelemetry {
	eventName: "container.attaching";
}

/**
 * The container "attached" telemetry event. This telemetry is produced from an internal Fluid container system event
 * {@link @fluidframework/container-definitions#IContainerEvents} which is emitted when a {@link @fluidframework/container-definitions#AttachState.Detached | detached}
 * container begins the process of {@link @fluidframework/container-definitions#AttachState.Attaching | attached} to the Fluid service.
 *
 * @see
 *
 * - {@link @fluidframework/container-definitions#IContainer.attachState}
 *
 * - {@link @fluidframework/container-definitions#IContainer.attach}
 *
 * @beta
 */
export interface ContainerAttachedTelemetry extends IContainerTelemetry {
	eventName: "container.attached";
}

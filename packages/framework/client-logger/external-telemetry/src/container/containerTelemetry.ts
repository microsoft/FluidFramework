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
	/**
	 * {@inheritdoc IExternalTelemetry.eventName}
	 */
	eventName: ContainerTelemetryEventName;
	/**
	 * Unique identifier for the container instance that generated the telemetry.
	 *
	 * @remarks This is not a stable identifier for the container across clients/time.
	 * Every load of the container will result in a different value.
	 *
	 * @see {@link IContainerTelemetry.documentId | `documentId` for a more stable identifier}
	 */
	containerId: string;
	/**
	 * {@inheritdoc @fluidframework/container-definitions#IContainer."clientId"}
	 */
	clientId?: string;
	/**
	 * Unique identifier for a container, stable across creation and load.
	 * I.e. different clients loading the same container (or the same client loading the container two separate times)
	 * will agree on this value.
	 *
	 * remarks This can be undefined for a container that has not been attached.
	 *
	 * @see More details about {@link IContainerTelemetry.containerId | `containerId` for an identifier of a particular _instance_ of the container being created/loaded }
	 */
	documentId?: string;
}

/**
 * The container "connected" telemetry event.
 * It is produced from an internal Fluid container system event {@link @fluidframework/container-definitions#IContainerEvents} which is emitted when the {@link @fluidframework/container-definitions#IContainer} completes connecting to the Fluid service.
 *
 * @see More details about {@link @fluidframework/container-definitions#IContainer.connectionState  | the containers connection state}
 * @see More details about {@link @fluidframework/container-definitions#IContainer.connect | the function to connect a container }
 * @see More details about{@link @fluidframework/container-definitions#IContainer.connectionState  | the containers connection state}
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
 * @see More details about{@link @fluidframework/container-definitions#IContainer.connectionState  | the containers connection state}
 *
 * @see More details about{@link @fluidframework/container-definitions#IContainer.disconnect | the function to disconnect a container}
 *
 * @beta
 */
export interface ContainerDisconnectedTelemetry extends IContainerTelemetry {
	eventName: "container.disconnected";
}

/**
 * The container "closed" telemetry event. This telemetry is produced from an internal Fluid container system event
 * {@link @fluidframework/container-definitions#IContainerEvents} which is emitted when the {@link @fluidframework/container-definitions#IContainer}
 * is closed, which means that instance of the container accepts no more changes.
 *
 * @see More details about {@link @fluidframework/container-definitions#IContainer.close | the containers close state}
 *
 * @beta
 */
export interface ContainerClosedTelemetry extends IContainerTelemetry {
	eventName: "container.closed";
	error?: ICriticalContainerError;
}

/**
 *  The container "attaching" telemetry event. This telemetry is produced from an internal Fluid container system event
 * {@link @fluidframework/container-definitions#IContainerEvents} which is emitted when a {@link @fluidframework/container-definitions#AttachState.Detached | detached} container begins the process of
 * {@link @fluidframework/container-definitions#AttachState.Attaching | attached} to the Fluid service.
 *
 * @see More details about {@link @fluidframework/container-definitions#IContainer.attachState | the container's attach state}
 *
 * @see {@link @fluidframework/container-definitions#IContainer.attach | the function to attach a container}
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
 * @see More details about {@link @fluidframework/container-definitions#IContainer.attachState | the container's attach state}
 *
 * @see {@link @fluidframework/container-definitions#IContainer.attach | the function to attach a container}
 *
 * @beta
 */
export interface ContainerAttachedTelemetry extends IContainerTelemetry {
	eventName: "container.attached";
}

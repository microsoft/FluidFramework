/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IExternalTelemetry } from "../common/index.js";
import { type ICriticalContainerError } from "@fluidframework/container-definitions";

/**
 * This file contains the types for container telemetry that can be produced.
 */

/**
 * This object contains names for Container Telemetry. Unlike the raw {@link @fluidframework/fluid-static#IFluidContainerEvents | IFluidContainer system event names} they contain more information such as the scope
 *
 * @beta
 */
export const ContainerTelemetryEventNames = {
	/**
	 * Name for the container telemetry event that is intended to be produced from the IFluidContainer "connected" {@link @fluidframework/fluid-static#IFluidContainerEvents | system event}
	 *
	 * @see {@link ContainerConnectedTelemetry}
	 *
	 *
	 * @beta
	 */
	CONNECTED: "fluidframework.container.connected",
	/**
	 * Name for the container telemetry event that is intended to be produced from the IFluidContainer "disconnected" {@link @fluidframework/fluid-static#IFluidContainerEvents | system event}
	 *
	 * @see {@link ContainerDisconnectedTelemetry}
	 *
	 *
	 * @beta
	 */
	DISCONNECTED: "fluidframework.container.disconnected",
	/**
	 * Name for the container telemetry event that is intended to be produced from the IFluidContainer "saved" {@link @fluidframework/fluid-static#IFluidContainerEvents | system event}
	 *
	 * @see {@link ContainerSavedTelemetry}
	 *
	 * @beta
	 */
	SAVED: "fluidframework.container.saved",
	/**
	 * Name for the container telemetry event that is intended to be produced from the IFluidContainer "dirty" {@link @fluidframework/fluid-static#IFluidContainerEvents | system event}
	 *
	 * @see {@link ContainerDirtyTelemetry}
	 *
	 * @beta
	 */
	DIRTY: "fluidframework.container.dirty",
	/**
	 * Name for the container telemetry event that is intended to be produced from the IFluidContainer "disposed" {@link @fluidframework/fluid-static#IFluidContainerEvents | system event}
	 *
	 * @see {@link ContainerDisposedTelemetry}
	 *
	 * @beta
	 */
	DISPOSED: "fluidframework.container.disposed",
	/**
	 * Synthetic telemetry that is not created from any underlying container system event. It is used to keep a pulse check on a live container
	 * @internal
	 */
	HEARTBEAT: "fluidframework.container.heartbeat",
} as const;

/**
 * The aggregate type for all values within {@link ContainerTelemetryEventNames}
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
	 * Unique identifier for a container, stable across creation and load.
	 * I.e. different clients loading the same container (or the same client loading the container two separate times)
	 * will agree on this value.
	 *
	 * @remarks This can be undefined for a container that has not been attached.
	 */
	containerId?: string;
}

/**
 * The container "connected" telemetry event.
 * It is produced from an internal Fluid container system event {@link @fluidframework/container-definitions#IContainerEvents} which is emitted when the {@link @fluidframework/container-definitions#IContainer} completes connecting to the Fluid service.
 *
 * @see More details about {@link @fluidframework/container-definitions#IContainer.connectionState  | the containers connection state}
 * @see More details about {@link @fluidframework/container-definitions#IContainer.connect | the function to connect a container }
 * @see More details about {@link @fluidframework/container-definitions#IContainer.connectionState  | the containers connection state}
 *
 * @beta
 */
export interface ContainerConnectedTelemetry extends IContainerTelemetry {
	eventName: "fluidframework.container.connected";
}

/**
 * The container "disconnected" telemetry event. This telemetry is produced from an internal Fluid container system event
 * {@link @fluidframework/container-definitions#IContainerEvents} which is emitted when the {@link @fluidframework/container-definitions#IContainer}
 * becomes disconnected from the Fluid service.
 *
 * @see More details about{@link @fluidframework/container-definitions#IContainer.connectionState | the containers connection state}
 *
 * @see More details about{@link @fluidframework/container-definitions#IContainer.disconnect | the function to disconnect a container}
 *
 * @beta
 */
export interface ContainerDisconnectedTelemetry extends IContainerTelemetry {
	eventName: "fluidframework.container.disconnected";
}

/**
 *
 * The Fluid container "saved" telemetry event. This telemetry is produced from the "saved" Fluid container system event
 * {@link @fluidframework/container-definitions#IFluidContainerEvents} which is emitted when all local changes/edits have been acknowledged by the service.
 *
 * @remarks "dirty" event will be emitted when the next local change has been made.
 *
 * @see {@link @fluidframework/fluid-static#IFluidContainer."isDirty"}
 *
 * @beta
 */
export interface ContainerSavedTelemetry extends IContainerTelemetry {
	eventName: "fluidframework.container.saved";
}

/**
 * The Fluid container "saved" telemetry event. This telemetry is produced from the "saved" Fluid container system event
 * {@link @fluidframework/container-definitions#IFluidContainerEvents} which is emitted when the first local change has been made, following a "saved" event.
 *
 * @remarks "saved" event will be emitted once all local changes have been acknowledged by the service.
 *
 * @see {@link @fluidframework/fluid-static#IFluidContainer."isDirty"}
 *
 * @beta
 */
export interface ContainerDirtyTelemetry extends IContainerTelemetry {
	eventName: "fluidframework.container.dirty";
}

/**
 * The Fluid container "saved" telemetry event. This telemetry is produced from the "saved" Fluid container system event
 * {@link @fluidframework/container-definitions#IFluidContainerEvents} which is emitted when the {@link @fluidframework/fluid-static#IFluidContainer} is closed, which permanently disables it.
 *
 * @beta
 */
export interface ContainerDisposedTelemetry extends IContainerTelemetry {
	eventName: "fluidframework.container.disposed";
	/**
	 * If the container was closed due to error (as opposed to an explicit call to
	 * {@link @fluidframework/fluid-static#IFluidContainer."dispose"}), this will contain details about the error that caused it.
	 */
	error?: ICriticalContainerError;
}

/**
 * @internal
 */
export interface ContainerHeartbeatTelemetry extends IContainerTelemetry {
	eventName: "fluidframework.container.heartbeat";
}

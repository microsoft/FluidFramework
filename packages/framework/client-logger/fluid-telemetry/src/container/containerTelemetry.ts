/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ICriticalContainerError } from "@fluidframework/container-definitions";

import { type IFluidTelemetry } from "../common/index.js";

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
	 */
	CONNECTED: "fluidframework.container.connected",
	/**
	 * Name for the container telemetry event that is intended to be produced from the IFluidContainer "disconnected" {@link @fluidframework/fluid-static#IFluidContainerEvents | system event}
	 *
	 * @see {@link ContainerDisconnectedTelemetry}
	 */
	DISCONNECTED: "fluidframework.container.disconnected",
	/**
	 * Name for the container telemetry event that is intended to be produced from the IFluidContainer "disposed" {@link @fluidframework/fluid-static#IFluidContainerEvents | system event}
	 *
	 * @see {@link ContainerDisposedTelemetry}
	 */
	DISPOSED: "fluidframework.container.disposed",
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
export interface IContainerTelemetry extends IFluidTelemetry {
	/**
	 * {@inheritdoc IFluidTelemetry.eventName}
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
	/**
	 * Unique identifier for the container instance that generated the telemetry.
	 * This is not a stable identifier for the container across clients/time.
	 * Every load of the container will result in a different value.
	 *
	 */
	containerInstanceId: string;
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
	/**
	 * {@inheritDoc IFluidTelemetry.eventName}
	 */
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
	/**
	 * {@inheritDoc IFluidTelemetry.eventName}
	 */
	eventName: "fluidframework.container.disconnected";
}

/**
 *
 * The Fluid container "disposed" telemetry event. This telemetry is produced from the "disposed" Fluid container system event
 * which is emitted when the {@link @fluidframework/fluid-static#IFluidContainer} is closed, which permanently disables it.
 *
 * @see More details about{@link @fluidframework/container-definitions#IContainer.close | the container close event}
 *
 * @beta
 */
export interface ContainerDisposedTelemetry extends IContainerTelemetry {
	/**
	 * {@inheritDoc IFluidTelemetry.eventName}
	 */
	eventName: "fluidframework.container.disposed";
	/**
	 * If the container was closed due to error (as opposed to an explicit call to
	 * {@link @fluidframework/fluid-static#IFluidContainer."dispose"}), this will contain details about the error that caused it.
	 */
	error?: ICriticalContainerError;
}

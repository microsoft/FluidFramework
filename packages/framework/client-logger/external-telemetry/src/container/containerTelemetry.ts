import { IExternalTelemetry } from "../common/telemetry";
import { IContainer } from "@fluidframework/container-definitions";
/**
 * This file contains the types for container telemetry that can be produced.
 */

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
	eventName: ContainerTelemetryEventName.CONNECTED;
}

/**
 * This enum contains names for Container Telemetry. Unlike the raw container system event names they contain more information such as the scope
 *
 */
export enum ContainerTelemetryEventName {
	/**
	 * Name for the container telemetry event that is intended to be produced from the internal "connected" {@link IContainerEvents} event
	 *
	 * @see {@link ContainerConnectedTelemetry}
	 */
	CONNECTED = "container.connected",

	/**
	 * Name for the container telemetry event that is intended to be produced from the internal "disconnected"
	 * container system event which is emitted when the {@link IContainer} becomes disconnected from the Fluid service.
	 *
	 * @remarks Reflects connection state changes against the (delta) service acknowledging ops/edits.
	 *
	 * @see
	 *
	 * - {@link IContainer.connectionState}
	 *
	 * - {@link IContainer.disconnect}
	 */
	DISCONNECTED = "container.disconnected",

	/**
	 * Emitted when a {@link AttachState.Detached | detached} container begins the process of
	 * {@link AttachState.Attaching | attached} to the Fluid service.
	 *
	 * @see
	 *
	 * - {@link IContainer.attachState}
	 *
	 * - {@link IContainer.attach}
	 */
	ATTACHING = "container.attaching",

	/**
	 * Emitted when the {@link AttachState.Attaching | attaching} process is complete and the container is
	 * {@link AttachState.Attached | attached} to the Fluid service.
	 *
	 * @see
	 *
	 * - {@link IContainer.attachState}
	 *
	 * - {@link IContainer.attach}
	 */
	ATTACHED = "container.attached",

	/**
	 * Emitted when the {@link IContainer} is closed, which permanently disables it.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `error`: If the container was closed due to error, this will contain details about the error that caused it.
	 *
	 * @see {@link IContainer.close}
	 */
	CLOSED = "container.closed",

	/**
	 * Emitted when the container encounters a state which may lead to errors, which may be actionable by the consumer.
	 *
	 * @remarks
	 *
	 * Note: this event is not intended for general use.
	 * The longer-term intention is to surface warnings more directly on the APIs that produce them.
	 * For now, use of this should be avoided when possible.
	 *
	 * Listener parameters:
	 *
	 * - `error`: The warning describing the encountered state.
	 */
	WARNING = "container.warning",
}

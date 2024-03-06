import { IContainer } from "@fluidframework/container-definitions";

export enum ContainerEventName {
	/**
	 * Emitted when the {@link IContainer} completes connecting to the Fluid service.
	 *
	 * @remarks Reflects connection state changes against the (delta) service acknowledging ops/edits.
	 *
	 * @see
	 *
	 * - {@link IContainer.connectionState}
	 *
	 * - {@link IContainer.connect}
	 */
	CONNECTED = "connected",

	/**
	 * Emitted when the {@link IContainer} becomes disconnected from the Fluid service.
	 *
	 * @remarks Reflects connection state changes against the (delta) service acknowledging ops/edits.
	 *
	 * @see
	 *
	 * - {@link IContainer.connectionState}
	 *
	 * - {@link IContainer.disconnect}
	 */
	DISCONNECTED = "disconnected",

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
	ATTACHING = "attaching",

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
	ATTACHED = "attached",

	/**
	 * Emitted when the {@link IContainer} is closed, which permanently disables it.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `error`: If the container was closed due to error, this will contain details about the error that caused it.
	 *
	 * @see {@link IContainer.close}
	 */
	CLOSED = "closed",

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
	WARNING = "warning",
}

/**
 * This enum contains a non-exhaustive set of the unique names raw system events from {@link IContainerEvents} produced by Fluid containers.
 *
 * @remarks This should probably exist within IContainer itself instead of being defined here.
 */
export enum ContainerSystemEventName {
	CONNECTED = "connected",
	DISCONNECTED = "disconnected",
	ATTACHING = "attaching",
	ATTACHED = "attached",
	CLOSED = "closed",
	WARNING = "warning",
}

/**
 * This enum contains a non-exhaustive set of the unique event names of raw events from {@link IContainerEvents} produced by Fluid containers.
 * It's important to note that each actual system events is a function signature such as `(event: "readonly", listener: (readonly: boolean) => void): void;`
 * but this enum only caputres the event name in each function.
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

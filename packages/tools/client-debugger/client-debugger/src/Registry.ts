/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IEvent } from "@fluidframework/common-definitions";
import { IContainer } from "@fluidframework/container-definitions";
import { IFluidLoadable } from "@fluidframework/core-interfaces";

import { FluidClientDebugger } from "./FluidClientDebugger";
import { IFluidClientDebugger } from "./IFluidClientDebugger";

/**
 * Properties for configuring a {@link IFluidClientDebugger}.
 *
 * @public
 */
export interface FluidClientDebuggerProps {
	/**
	 * The Container with which the debugger will be associated.
	 */
	container: IContainer;

	/**
	 * The ID of {@link FluidClientDebuggerProps.container | the Container}.
	 */
	containerId: string;

	/**
	 * Optional: Data belonging to {@link FluidClientDebuggerProps.container | the Container}.
	 *
	 * @remarks The debugger will not mutate this data.
	 */
	containerData?: IFluidLoadable | Record<string, IFluidLoadable>;

	/**
	 * Optional: Nickname for {@link FluidClientDebuggerProps.container | the Container} / debugger instance.
	 *
	 * @remarks
	 *
	 * Associated tooling may take advantage of this to differentiate between debugger instances using
	 * semantically meaningful information.
	 *
	 * If not provided, the {@link FluidClientDebuggerProps.containerId} will be used for the purpose of distinguising
	 * debugger instances.
	 */
	containerNickname?: string;
}

/**
 * Event to montor client debugger list change.
 * @internal
 */
export interface DebuggerRegistryEvents extends IEvent {
	/**
	 * Emitted when a {@link IFluidClientDebugger} is registered.
	 *
	 * @eventProperty
	 */
	(event: "debuggerRegistered", listener: (containerId: string) => void): void;

	/**
	 * Emitted when a {@link IFluidClientDebugger} is closed.
	 *
	 * @eventProperty
	 */
	(event: "debuggerClosed", listener: (containerId: string) => void): void;
}

/**
 * Contract for maintaining a global client debugger registry to store all registered client debugger.
 * @internal
 */
export class DebuggerRegistry extends TypedEventEmitter<DebuggerRegistryEvents> {
	private readonly registeredDebuggers: Map<string, FluidClientDebugger> = new Map();

	public constructor() {
		super();
	}

	/**
	 * Initializes a {@link IFluidClientDebugger} from the provided properties and binds it to the global context.
	 */
	public initializeDebugger(props: FluidClientDebuggerProps): void {
		const { containerId } = props;
		const existingDebugger = this.registeredDebuggers.get(containerId);
		if (existingDebugger !== undefined) {
			console.warn(
				`Active debugger registry already contains an entry for container ID "${containerId}". Override existing entry.`,
			);
			existingDebugger.dispose();
		}

		const clientDebugger = new FluidClientDebugger(props);
		console.log(`Add new debugger${clientDebugger.containerId}`);
		this.registeredDebuggers.set(containerId, clientDebugger);
		this.emit("debuggerRegistered", containerId, clientDebugger);
	}

	/**
	 * Closes ({@link IFluidClientDebugger.dispose | disposes}) a registered client debugger associated with the
	 * provided Container ID.
	 */
	public closeDebugger(containerId: string): void {
		if (this.registeredDebuggers.has(containerId)) {
			const clientDebugger = this.registeredDebuggers.get(containerId);
			if (clientDebugger === undefined) {
				console.warn(
					`No active client debugger associated with container ID "${containerId}" was found.`,
				);
			} else {
				clientDebugger.dispose();
				this.registeredDebuggers.delete(containerId);
				this.emit("debuggerClosed", containerId);
			}
		} else {
			console.warn(`Fluid Client debugger never been registered.`);
		}
	}

	/**
	 * Gets the registered client debugger associated with the provided Container ID if one is registered.
	 * @returns the client debugger or undefined if not found.
	 */
	public getRegisteredDebuggers(): Map<string, IFluidClientDebugger> {
		return this.registeredDebuggers;
	}
}

/**
 * Initializes a {@link IFluidClientDebugger} from the provided properties, binding it to the global context.
 *
 * @remarks
 *
 * If there is an existing debugger session associated with the provided {@link FluidClientDebuggerProps.containerId},
 * the existing debugger session will be closed, and a new one will be generated from the provided props.
 *
 * @public
 */
export function initializeFluidClientDebugger(props: FluidClientDebuggerProps): void {
	getDebuggerRegistry().initializeDebugger(props);
}

/**
 * Closes ({@link IFluidClientDebugger.dispose | disposes}) a registered client debugger associated with the
 * provided Container ID.
 *
 * @public
 */
export function closeFluidClientDebugger(containerId: string): void {
	getDebuggerRegistry().closeDebugger(containerId);
}

/**
 * Gets the registered client debugger associated with the provided Container ID if one is registered.
 *
 * @remarks Will return `undefined` if no such debugger is registered.
 *
 * @internal
 */
export function getFluidClientDebugger(containerId: string): IFluidClientDebugger | undefined {
	const debuggerRegistry = getDebuggerRegistry().getRegisteredDebuggers();
	return debuggerRegistry.get(containerId);
}

/**
 * Gets all registered client debuggers from the registry.
 *
 * @internal
 */
export function getFluidClientDebuggers(): IFluidClientDebugger[] {
	const debuggerRegistry = getDebuggerRegistry();

	const clientDebuggers: IFluidClientDebugger[] = [];
	for (const [, clientDebugger] of debuggerRegistry.getRegisteredDebuggers()) {
		clientDebuggers.push(clientDebugger);
	}

	return clientDebuggers;
}

/**
 * Gets the debugger registry from the window. Initializes it if one does not yet exist.
 *
 * @throws Throws an error if initialization / binding to the window object fails.
 *
 * @internal
 */
export function getDebuggerRegistry(): DebuggerRegistry {
	if (globalThis.fluidClientDebuggersRegistry === undefined) {
		// If no client debuggers have been bound, initialize list
		globalThis.fluidClientDebuggersRegistry = new DebuggerRegistry();
	}

	const debuggerRegistry = globalThis.fluidClientDebuggersRegistry as DebuggerRegistry;

	if (debuggerRegistry === undefined) {
		throw new Error("Fluid Client debugger registry initialization failed.");
	}

	return debuggerRegistry;
}

/**
 * Clears the debugger registry, disposing of any remaining debugger objects.
 *
 * @internal
 */
export function clearDebuggerRegistry(): void {
	const debuggerRegistry = globalThis.fluidClientDebuggers as Map<string, IFluidClientDebugger>;
	if (debuggerRegistry !== undefined) {
		for (const [, clientDebugger] of debuggerRegistry) {
			if (clientDebugger.disposed) {
				console.warn(`Fluid Client debugger has already been disposed.`);
			} else {
				clientDebugger.dispose();
			}
		}
	}

	globalThis.fluidClientDebuggers = undefined;
}

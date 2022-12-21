/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
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
 * @public
 */
export interface DebuggerRegistryEvents extends IEvent {
	/**
	 * Emitted when a {@link FluidClientDebugger | clientDebugger} is registered.
	 *
	 * @eventProperty
	 */
	(
		event: "debuggerRegistered",
		listener: (containerId: string, clientDebugger: IFluidClientDebugger) => void,
	): void;

	/**
	 * Emitted when a {@link FluidClientDebugger | clientDebugger} is closed.
	 *
	 * @eventProperty
	 */
	(event: "debuggerClosed", listener: (containerId: string) => void): void;
}

/**
 * Contract for maintaining a global client debugger registry to store all registered client debugger and current
 * displaying debugger.
 * @Internal
 */
export class DebuggerRegistry extends IEventProvider<DebuggerRegistryEvents> {
	/**
	 * A map of registered debuggers, which debugger monitor one container.
	 */
	private readonly registeredDebuggers: Map<string, IFluidClientDebugger> = new Map();

	/**
	 * The debugger is currently displaying.
	 */
	private currentDisplayDebugger: IFluidClientDebugger;

	public constructor() {
		super();
	}

	/**
	 * Initializes a {@link IFluidClientDebugger} from the provided properties, binding it to the global context. Emit a
	 * debugger registered event.
	 * @public
	 *
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
		this.registeredDebuggers.set(containerId, clientDebugger);
		this.emit("debuggerRegistered", containerId, clientDebugger);
	}

	/**
	 * Closes ({@link IFluidClientDebugger.dispose | disposes}) a registered client debugger associated with the
	 * provided Container ID. Emit a debugger closed event.
	 *
	 * @public
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
	 * Generate a new list of client debugger from global context
	 * @returns client debuggers list.
	 */
	public getRegisteredDebuggers(): IFluidClientDebugger[] {
		const clientDebuggers: IFluidClientDebugger[] = [];
		for (const [, clientDebugger] of this.registeredDebuggers) {
			clientDebuggers.push(clientDebugger);
		}

		return clientDebuggers;
	}

	/**
	 * Get the current display debugger.
	 * @returns the current displaying debugger.
	 */
	public getCurrentDisplayDebugger(): IFluidClientDebugger {
		return this.currentDisplayDebugger;
	}

	/**
	 * Update the current display debugger.
	 * @param currentDisplayDebugger - the current display debugger.
	 */
	public setCurrentDisplayDebugger(currentDisplayDebugger: IFluidClientDebugger): void {
		this.currentDisplayDebugger = currentDisplayDebugger;
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
	const clientDebuggers = getDebuggerRegistry().getRegisteredDebuggers();
	return clientDebuggers.find((c) => c.containerId === containerId);
}

/**
 * Gets all registered client debuggers from the registry.
 *
 * @internal
 */
export function getFluidClientDebuggers(): IFluidClientDebugger[] {
	const debuggerRegistry = getDebuggerRegistry();

	return debuggerRegistry.getRegisteredDebuggers();
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

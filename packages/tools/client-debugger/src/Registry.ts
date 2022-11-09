/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { FluidClientDebugger } from "./FluidClientDebugger";
import { FluidClientDebuggerProps, IFluidClientDebugger } from "./IFluidClientDebugger";

/**
 * Initializes a {@link IFluidClientDebugger} from the provided properties, binding it to the global context.
 *
 * @remarks
 *
 * If there is an existing debugger session associated with the provided {@link FluidClientDebuggerProps.containerId},
 * the existing debugger session object will be returned, rather than creating a new one.
 */
export function initializeFluidClientDebugger(
    props: FluidClientDebuggerProps,
): IFluidClientDebugger {
    const { containerId, container, audience, containerData } = props;

    const debuggerRegistry = getDebuggerRegistry();

    let clientDebugger = debuggerRegistry.get(containerId);
    if (clientDebugger !== undefined) {
        console.warn(
            `Active debugger registry already contains an entry for container ID "${containerId}". Returning existing entry.`,
        );
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return debuggerRegistry.get(containerId)!;
    } else {
        clientDebugger = new FluidClientDebugger(containerId, container, audience, containerData);
        debuggerRegistry.set(containerId, clientDebugger);
        return clientDebugger;
    }
}

/**
 * Closes ({@link IFluidClientDebugger.dispose | disposes}) a registered client debugger associated with the
 * provided Container ID.
 */
export function closeFluidClientDebugger(containerId: string): void {
    const debuggerRegistry = getDebuggerRegistry();

    const clientDebugger = debuggerRegistry.get(containerId);
    if (clientDebugger === undefined) {
        console.warn(
            `No active client debugger associated with container ID "${containerId}" was found.`,
        );
    } else {
        clientDebugger.dispose();
        debuggerRegistry.delete(containerId);
    }
}

/**
 * Gets the registered client debugger associated with the provided Container ID if one is registered.
 * Will return `undefined` if no such debugger is registered.
 */
export function getFluidClientDebugger(containerId: string): IFluidClientDebugger | undefined {
    const debuggerRegistry = getDebuggerRegistry();
    return debuggerRegistry.get(containerId);
}

/**
 * Gets all registered client debuggers from the registry.
 */
export function getFluidClientDebuggers(): IFluidClientDebugger[] {
    const debuggerRegistry = getDebuggerRegistry();

    const clientDebuggers: IFluidClientDebugger[] = [];
    for (const [, clientDebugger] of debuggerRegistry) {
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
export function getDebuggerRegistry(): Map<string, IFluidClientDebugger> {
    if (globalThis.fluidClientDebuggers === undefined) {
        // If no client debuggers have been bound, initialize list
        globalThis.fluidClientDebuggers = new Map<string, IFluidClientDebugger>();
    }

    const debuggerRegistry = globalThis.fluidClientDebuggers as Map<string, IFluidClientDebugger>;

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

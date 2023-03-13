/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IEvent } from "@fluidframework/common-definitions";
import { IContainer } from "@fluidframework/container-definitions";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
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
 *
 * @remarks
 *
 * This class listens to incoming messages from the window (globalThis), and posts messages to it upon relevant
 * state changes and when requested.
 *
 * **Messages it listens for:**
 *
 * - {@link GetContainerListMessage}: When received, the registry will post {@link RegistryChangeMessage}.
 *
 * TODO: Document others as they are added.
 *
 * **Messages it posts:**
 *
 * - {@link RegistryChangeMessage}: The registry will post this whenever the list of registered
 * debuggers changes, or when requested (via {@link GetContainerListMessage}).
 *
 * TODO: Document others as they are added.
 *
 * @internal
 */
export declare class DebuggerRegistry extends TypedEventEmitter<DebuggerRegistryEvents> {
    private readonly registeredDebuggers;
    /**
     * Handlers for inbound messages related to the registry.
     */
    private readonly inboundMessageHandlers;
    /**
     * Event handler for messages coming from the window (globalThis).
     */
    private readonly windowMessageHandler;
    /**
     * Posts a {@link RegistryChangeMessage} to the window (globalThis).
     */
    private readonly postRegistryChange;
    constructor();
    /**
     * Initializes a {@link IFluidClientDebugger} from the provided properties and binds it to the global context.
     */
    initializeDebugger(props: FluidClientDebuggerProps): void;
    /**
     * Closes ({@link IFluidClientDebugger.dispose | disposes}) a registered client debugger associated with the
     * provided Container ID.
     */
    closeDebugger(containerId: string): void;
    /**
     * Gets the registered client debugger associated with the provided Container ID if one is registered.
     * @returns the client debugger or undefined if not found.
     */
    getRegisteredDebuggers(): Map<string, IFluidClientDebugger>;
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
export declare function initializeFluidClientDebugger(props: FluidClientDebuggerProps): void;
/**
 * Closes ({@link IFluidClientDebugger.dispose | disposes}) a registered client debugger associated with the
 * provided Container ID.
 *
 * @public
 */
export declare function closeFluidClientDebugger(containerId: string): void;
/**
 * Gets the registered client debugger associated with the provided Container ID if one is registered.
 *
 * @remarks Will return `undefined` if no such debugger is registered.
 *
 * @internal
 */
export declare function getFluidClientDebugger(containerId: string): IFluidClientDebugger | undefined;
/**
 * Gets all registered client debuggers from the registry.
 *
 * @internal
 */
export declare function getFluidClientDebuggers(): IFluidClientDebugger[];
/**
 * Gets the debugger registry from the window. Initializes it if one does not yet exist.
 *
 * @throws Throws an error if initialization / binding to the window object fails.
 *
 * @internal
 */
export declare function getDebuggerRegistry(): DebuggerRegistry;
/**
 * Clears the debugger registry, disposing of any remaining debugger objects.
 *
 * @internal
 */
export declare function clearDebuggerRegistry(): void;
//# sourceMappingURL=Registry.d.ts.map
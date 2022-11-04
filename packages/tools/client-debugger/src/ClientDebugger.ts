/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDisposable, IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
    ConnectionState,
    IAudience,
    IContainer,
    ICriticalContainerError,
} from "@fluidframework/container-definitions";
import { IClient } from "@fluidframework/protocol-definitions";

// TODOs:
// - Data recording configuration (what things the user wishes to subscribe to)
// - Audience history (including timestamps)
// - Full ops history

/**
 * Events emitted by {@link IFluidClientDebugger}.
 */
export interface IFluidClientDebuggerEvents extends IEvent {
    /**
     * Emitted when the {@link @fluidframework/container-definitions#IContainer} completes connecting to the
     * Fluid service.
     *
     * @remarks
     *
     * Reflects connection state changes against the (delta) service acknowledging ops/edits.
     *
     * Associated with the state transition of {@link @fluidframework/container-definitions#IContainer.connectionState}
     * to {@link @fluidframework/container-definitions#(ConnectionState:namespace).Connected}.
     */
    (event: "containerConnected", listener: (clientId: string) => void): void;

    /**
     * Emitted when the {@link @fluidframework/container-definitions#IContainer} becomes disconnected from the
     * Fluid service.
     *
     * @remarks
     *
     * Reflects connection state changes against the (delta) service acknowledging ops/edits.
     *
     * Associated with the state transition of {@link @fluidframework/container-definitions#IContainer.connectionState}
     * to {@link @fluidframework/container-definitions#(ConnectionState:namespace).Disconnected}.
     */
    (event: "containerDisconnected", listener: () => void): void;

    /**
     * Emitted when the Container is closed, which permanently disables it.
     *
     * @remarks Listener parameters:
     *
     * - `error`: If container was closed due to error (as opposed to an explicit call to
     * {@link @fluidframework/container-definitions#IContainer.close}), this contains further details
     * about the error that caused the closure.
     */
    (event: "containerClosed", listener: (error?: ICriticalContainerError) => void);

    /**
     * Emitted when a new member is added to the Audience.
     *
     * @remarks Listener parameters:
     *
     * - `clientId`: The unique ID of the newly added member client.
     *
     * - `client`: The newly added member client.
     */
    (event: "audienceMemberAdded", listener: (clientId: string, client: IClient) => void);

    /**
     * Emitted when a member is removed from the Audience.
     *
     * @remarks Listener parameters:
     *
     * - `clientId`: The unique ID of the removed member client.
     *
     * - `client`: The removed member client.
     */
    (event: "audienceMemberRemoved", listener: (clientId: string, client: IClient) => void);
}

/**
 * TODO
 */
export interface IFluidClientDebugger
    extends IEventProvider<IFluidClientDebuggerEvents>,
        IDisposable {
    get connectionState(): ConnectionState;

    // TODO: state associated with events.

    /**
     * Disposes the debugger session.
     * All data recording will stop, and no further state change events will be emitted.
     */
    dispose(): void;
}

/**
 * {@link IFluidClientDebugger} implementation.
 *
 * @internal
 */
class FluidClientDebugger
    extends TypedEventEmitter<IFluidClientDebuggerEvents>
    implements IFluidClientDebugger
{
    /**
     * {@inheritDoc FluidClientDebuggerProps.containerId}
     */
    public readonly containerId: string;

    /**
     * {@inheritDoc FluidClientDebuggerProps.container}
     */
    private readonly container: IContainer;

    /**
     * {@inheritDoc FluidClientDebuggerProps.audience}
     */
    private readonly audience: IAudience;

    // #region Container-related event handlers

    private readonly containerConnectedHandler = (clientId: string): boolean =>
        this.emit("containerConnected", clientId);
    private readonly containerDisconnectedHandler = (): boolean =>
        this.emit("ContainerDisconnected");
    private readonly containerClosedHandler = (error?: ICriticalContainerError): boolean =>
        this.emit("containerClosed", error);

    // #endregion

    // #region Audience-related event handlers

    private readonly audienceMemberAddedHandler = (clientId: string, client: IClient): boolean =>
        this.emit("audienceMemberAdded", clientId, client);
    private readonly audienceMemberRemovedHandler = (clientId: string, client: IClient): boolean =>
        this.emit("audienceMemberRemoved", clientId, client);

    // #endregion

    /**
     * Whether or not the instance has been disposed yet.
     *
     * @see {@link IFluidClientDebugger.dispose}
     */
    private _disposed: boolean;

    constructor(containerId: string, container: IContainer, audience: IAudience) {
        super();

        this.containerId = containerId;
        this.container = container;
        this.audience = audience;

        // Bind Container events
        this.container.on("connected", this.containerConnectedHandler);
        this.container.on("disconnected", this.containerDisconnectedHandler);
        this.container.on("closed", this.containerClosedHandler);

        // Bind Audience events
        this.audience.on("addMember", this.audienceMemberAddedHandler);
        this.audience.on("removeMember", this.audienceMemberRemovedHandler);

        // TODO: other events as needed

        this._disposed = false;
    }

    /**
     * {@inheritDoc IFluidClientDebugger.connectionState}
     */
    public get connectionState(): ConnectionState {
        return this.container.connectionState;
    }

    /**
     * {@inheritDoc IFluidClientDebugger.dispose}
     */
    public dispose(): void {
        // Unbind Container events
        this.container.off("connected", this.containerConnectedHandler);
        this.container.off("disconnected", this.containerDisconnectedHandler);
        this.container.off("closed", this.containerClosedHandler);

        // Unbind Audience events
        this.audience.off("addMember", this.audienceMemberAddedHandler);
        this.audience.off("removeMember", this.audienceMemberRemovedHandler);

        this._disposed = true;
    }

    /**
     * {@inheritDoc @fluidframework/common-definitions#IDisposable.disposed}
     */
    public get disposed(): boolean {
        return this._disposed;
    }
}

/**
 * TODO
 */
export interface FluidClientDebuggerProps {
    /**
     * TODO
     */
    containerId: string;

    /**
     * TODO
     */
    container: IContainer;

    /**
     * TODO
     */
    audience: IAudience;
}

/**
 * TODO
 */
export function initializeFluidClientDebugger(
    props: FluidClientDebuggerProps,
): IFluidClientDebugger {
    const { containerId, container, audience } = props;

    const debuggerRegistry = getDebuggerRegistry();

    let clientDebugger = debuggerRegistry.get(containerId);
    if (clientDebugger !== undefined) {
        console.warn(
            `Active debugger registry already contains an entry for container ID "${containerId}". Returning existing entry.`,
        );
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return debuggerRegistry.get(containerId)!;
    } else {
        clientDebugger = new FluidClientDebugger(containerId, container, audience);
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
        throw new Error("Fluid debugger registry initialization failed.");
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
            clientDebugger.dispose();
        }
    }

    globalThis.fluidClientDebuggers = undefined;
}

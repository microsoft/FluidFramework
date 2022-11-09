/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDisposable, IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
    AttachState,
    IAudience,
    IContainer,
    ICriticalContainerError,
} from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { IClient, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

// TODOs:
// - Data recording configuration (what things the user wishes to subscribe to)
// - Audience history (including timestamps)
// - Full ops history
// - Audit events to simplify hooks for consumers
// - Document association between data that changes, and the events that signal the changes.

/**
 * Events emitted by {@link IFluidClientDebugger}.
 */
export interface IFluidClientDebuggerEvents extends IEvent {
    // #region Container-related events

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
     * Emitted when the Container has new pending local operations (ops)
     * (i.e. {@link @fluidframework/container-definitions#IContainer.dirty} is `true`).
     */
    (event: "containerDirty", listener: () => void);

    /**
     * Emitted when the Container finishes processing all pending local operations (ops)
     * (i.e. {@link @fluidframework/container-definitions#IContainer.dirty} is `false`).
     */
    (event: "containerSaved", listener: () => void);

    // #region DeltaManager-related events

    /**
     * Emitted when an incoming operation (op) has been processed.
     *
     * @remarks Listener parameters:
     *
     * - `message`: The op that was processed.
     *
     * - `processingTime`: The amount of time it took to process the op, expressed in milliseconds.
     */
    (
        event: "incomingOpProcessed",
        listener: (op: ISequencedDocumentMessage, processingTime: number) => void,
    );

    // #endregion

    // #endregion

    // #region Audience-related events

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

    // #endregion
}

/**
 * Base interface for data logs, associating data with a timestamp at which the data was recorded by the debugger.
 */
export interface LogEntry {
    /**
     * The time at which some data was recorded.
     */
    timestamp: Date;
}

/**
 * Represents a change in some state, coupled with a timestamp.
 *
 * @typeParam TState - The type of state being tracked.
 */
export interface StateChangeLogEntry<TState> extends LogEntry {
    /**
     * The new state value.
     */
    newState: TState;
}

/**
 * Represents a {@link @fluidframework/container-loader#ConnectionState} change.
 */
export interface ConnectionStateChangeLogEntry extends StateChangeLogEntry<ConnectionState> {
    /**
     * When associated with a new connection (i.e. state transition to
     * {@link @fluidframework/container-loader#ConnectionState.Connected}), this will be the new client ID.
     *
     * Will always be undefined for disconnects.
     */
    clientId: string | undefined;
}

/**
 * Represents a processed operation (op), paired with a timestamp.
 */
export interface OpsLogEntry extends LogEntry {
    /**
     * The operation (op) that was processed.
     */
    op: ISequencedDocumentMessage;
}

/**
 * Represents a processed operation (op), paired with a timestamp.
 */
export interface AudienceChangeLogEntry extends LogEntry {
    /**
     * The ID of the client that was added or removed.
     */
    clientId: string;

    /**
     * Metadata abou the client that was added or removed.
     */
    client: IClient;

    /**
     * Whether the change represents a client being added to or removed from the collaborative session.
     */
    changeKind: "added" | "removed";
}

/**
 * TODO
 */
export interface IFluidClientDebugger
    extends IEventProvider<IFluidClientDebuggerEvents>,
        IDisposable {
    /**
     * The ID of the Container with which the debugger is associated.
     *
     * @remarks This value will not change during the lifetime of the debugger.
     */
    readonly containerId: string;

    // #region Container data

    /**
     * Gets the Container's {@link @fluidframework/container-definitions#IContainer.attachState}
     */
    getContainerAttachState(): AttachState;

    /**
     * Gets the Container's {@link @fluidframework/container-definitions#IContainer.connectionState}.
     */
    getContainerConnectionState(): ConnectionState;

    /**
     * Gets the history of all ConnectionState changes since the debugger session was initialized.
     */
    getContainerConnectionStateLog(): readonly ConnectionStateChangeLogEntry[];

    /**
     * Gets the session user's {@link @fluidframework/container-definitions#IContainer.clientId}.
     *
     * @remarks Will be undefined when the Container is not connected.
     */
    getClientId(): string | undefined;

    /**
     * Gets the Container's {@link @fluidframework/container-definitions#IContainer.resolvedUrl}.
     */
    getResolvedUrl(): IResolvedUrl | undefined;

    /**
     * Whether or not the Container is currently {@link @fluidframework/container-definitions#IContainer.isDirty | dirty}.
     */
    isContainerDirty(): boolean;

    /**
     * Whether or not the Container has been {@link @fluidframework/container-definitions#IContainer.disposed}.
     */
    isContainerClosed(): boolean;

    // #region DeltaManager data

    /**
     * Gets the Container's current {@link @fluid-framework/container-definitions#IDeltaManager.minimumSequenceNumber}.
     */
    getMinimumSequenceNumber(): number;

    /**
     * All operations (ops) processed since the debugger was initialized.
     */
    getOpsLog(): readonly OpsLogEntry[];

    // #endregion

    // #endregion

    // #region Audience data

    /**
     * Gets all of the Audience's {@link @fluidframework/container-definitions#IAudience.getMembers | members}.
     */
    getAudienceMembers(): Map<string, IClient>;

    /**
     * Historical log of audience member changes.
     */
    getAuidienceHistory(): readonly AudienceChangeLogEntry[];

    // #endregion

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
     * {@inheritDoc IFluidClientDebugger.containerId}
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

    // #region Accumulated log state

    /**
     * Accumulated data for {@link IFluidClientDebugger.getContainerConnectionStateLog}.
     */
    private readonly _connectionStateLog: ConnectionStateChangeLogEntry[];

    /**
     * Accumulated data for {@link IFluidClientDebugger.getOpsLog}.
     */
    private readonly _opsLog: OpsLogEntry[];

    /**
     * Accumulated data for {@link IFluidClientDebugger.getAudienceHistory}.
     */
    private readonly _audienceChangeLog: AudienceChangeLogEntry[];

    // #endregion

    // #region Container-related event handlers

    private readonly containerConnectedHandler = (clientId: string): boolean =>
        this.emit("containerConnected", clientId);
    private readonly containerDisconnectedHandler = (): boolean =>
        this.emit("containerDisconnected");
    private readonly containerClosedHandler = (error?: ICriticalContainerError): boolean =>
        this.emit("containerClosed", error);
    private readonly containerDirtyHandler = (): boolean => this.emit("containerDirty");
    private readonly containerSavedHandler = (): boolean => this.emit("containerSaved");

    // #region DeltaManager-related event handlers

    private readonly incomingOpProcessedHandler = (op: ISequencedDocumentMessage): boolean =>
        this.emit("incomingOpProcessed", op);

    // #endregion

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
     * @remarks Not related to Container disposal.
     *
     * @see {@link IFluidClientDebugger.dispose}
     */
    private _disposed: boolean;

    constructor(containerId: string, container: IContainer, audience: IAudience) {
        super();

        this.containerId = containerId;
        this.container = container;
        this.audience = audience;

        // TODO: would it be useful to log the states (and timestamps) at time of debugger intialize?
        this._connectionStateLog = [];
        this._opsLog = [];
        this._audienceChangeLog = [];

        // Bind Container events
        this.container.on("connected", (clientId) => this.onContainerConnected(clientId));
        this.container.on("disconnected", () => this.onContainerDisconnected());
        this.container.on("closed", (error) => this.onContainerClosed(error));
        this.container.on("op", (op) => this.onIncomingOpProcessed(op));
        this.container.on("dirty", () => this.onContainerDirty());
        this.container.on("saved", () => this.onContainerSaved());

        // Bind Audience events
        this.audience.on("addMember", this.audienceMemberAddedHandler);
        this.audience.on("removeMember", this.audienceMemberRemovedHandler);

        // TODO: other events as needed

        this._disposed = false;
    }

    // #region Container data

    /**
     * {@inheritDoc IFluidClientDebugger.getAttachState}
     */
    public getContainerAttachState(): AttachState {
        return this.container.attachState;
    }

    /**
     * {@inheritDoc IFluidClientDebugger.getConnectionState}
     */
    public getContainerConnectionState(): ConnectionState {
        return this.container.connectionState;
    }

    /**
     * {@inheritDoc IFluidClientDebugger.getConnectionStateLog}
     */
    public getContainerConnectionStateLog(): readonly ConnectionStateChangeLogEntry[] {
        // Clone array contents so consumers don't see local changes
        return this._connectionStateLog.map((value) => value);
    }

    /**
     * {@inheritDoc IFluidClientDebugger.getClientId}
     */
    public getClientId(): string | undefined {
        return this.container.clientId;
    }

    /**
     * {@inheritDoc IFluidClientDebugger.getResolvedUrl}
     */
    public getResolvedUrl(): IResolvedUrl | undefined {
        return this.container.resolvedUrl;
    }

    /**
     * {@inheritDoc IFluidClientDebugger.isContainerDirty}
     */
    public isContainerDirty(): boolean {
        return this.container.isDirty;
    }

    /**
     * {@inheritDoc IFluidClientDebugger.isContainerClosed}
     */
    public isContainerClosed(): boolean {
        return this.container.closed;
    }

    private onContainerConnected(clientId: string): void {
        this._connectionStateLog.push({
            newState: ConnectionState.Connected,
            timestamp: new Date(),
            clientId,
        });
        this.containerConnectedHandler(clientId);
    }

    private onContainerDisconnected(): void {
        this._connectionStateLog.push({
            newState: ConnectionState.Disconnected,
            timestamp: new Date(),
            clientId: undefined,
        });
        this.containerDisconnectedHandler();
    }

    private onContainerDirty(): void {
        // TODO: dirtiness history log?
        this.containerDirtyHandler();
    }

    private onContainerSaved(): void {
        // TODO: dirtiness history log?
        this.containerSavedHandler();
    }

    private onContainerClosed(error?: ICriticalContainerError): void {
        this.containerClosedHandler(error);
    }

    // #endregion

    // #region DeltaManager data

    /**
     * {@inheritDoc IFluidClientDebugger.getMinimumSequenceNumber}
     */
    public getMinimumSequenceNumber(): number {
        return this.container.deltaManager.minimumSequenceNumber;
    }

    public getOpsLog(): readonly OpsLogEntry[] {
        // Clone array contents so consumers don't see local changes
        return this._opsLog.map((value) => value);
    }

    private onIncomingOpProcessed(op: ISequencedDocumentMessage): void {
        this._opsLog.push({
            op,
            timestamp: new Date(),
        });

        this.incomingOpProcessedHandler(op);
    }

    // #endregion

    // #region Audience data

    /**
     * {@inheritDoc IFluidClientDebugger.getAudienceMembers}
     */
    public getAudienceMembers(): Map<string, IClient> {
        return this.audience.getMembers();
    }

    public getAuidienceHistory(): readonly AudienceChangeLogEntry[] {
        // Clone array contents so consumers don't see local changes
        return this._audienceChangeLog.map((value) => value);
    }

    // #endregion

    /**
     * {@inheritDoc IFluidClientDebugger.dispose}
     */
    public dispose(): void {
        // Unbind Container events
        this.container.off("connected", (clientId) => this.onContainerConnected(clientId));
        this.container.off("disconnected", () => this.onContainerDisconnected());
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
 * Properties for configuring a {@link IFluidClientDebugger}.
 */
export interface FluidClientDebuggerProps {
    /**
     * The ID of the Container with which the debugger will be associated.
     */
    containerId: string;

    /**
     * The Container with which the debugger will be associated.
     */
    container: IContainer;

    /**
     * The session audience with which the debugger will be associated.
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

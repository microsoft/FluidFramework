/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
    AttachState,
    IAudience,
    IContainer,
    ICriticalContainerError,
} from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { IClient, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

import { IFluidClientDebugger, IFluidClientDebuggerEvents } from "./IFluidClientDebugger";
import { AudienceChangeLogEntry, ConnectionStateChangeLogEntry } from "./Logs";

/**
 * {@link IFluidClientDebugger} implementation.
 *
 * @remarks This class is not intended for external use. Only its interface is exported by the library.
 *
 * @internal
 */
export class FluidClientDebugger
    extends TypedEventEmitter<IFluidClientDebuggerEvents>
    implements IFluidClientDebugger
{
    /**
     * {@inheritDoc IFluidClientDebugger.containerId}
     */
    public readonly containerId: string;

    /**
     * {@inheritDoc IFluidClientDebugger.containerData}
     */
    public readonly containerData: Record<string, IFluidLoadable>;

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
    private readonly _opsLog: ISequencedDocumentMessage[];

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

    // #region Debugger-specific event handlers

    private readonly debuggerDisposedHandler = (): boolean => this.emit("debuggerDisposed");

    // #endregion

    /**
     * Whether or not the instance has been disposed yet.
     *
     * @remarks Not related to Container disposal.
     *
     * @see {@link IFluidClientDebugger.dispose}
     */
    private _disposed: boolean;

    constructor(
        containerId: string,
        container: IContainer,
        audience: IAudience,
        containerData: Record<string, IFluidLoadable>,
    ) {
        super();

        this.containerId = containerId;
        this.containerData = containerData;
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
        this.audience.on("addMember", (clientId, client) =>
            this.onAudienceMemberAdded(clientId, client),
        );
        this.audience.on("removeMember", (clientId, client) =>
            this.onAudienceMemberRemoved(clientId, client),
        );

        // TODO: other events as needed

        this._disposed = false;
    }

    // #region Container data

    /**
     * {@inheritDoc IFluidClientDebugger.getClientId}
     */
    public getClientId(): string | undefined {
        return this.container.clientId;
    }

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
     * {@inheritDoc IFluidClientDebugger.getResolvedUrl}
     */
    public getContainerResolvedUrl(): IResolvedUrl | undefined {
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
            timestamp: Date.now(),
            clientId,
        });
        this.containerConnectedHandler(clientId);
    }

    private onContainerDisconnected(): void {
        this._connectionStateLog.push({
            newState: ConnectionState.Disconnected,
            timestamp: Date.now(),
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

    public getOpsLog(): readonly ISequencedDocumentMessage[] {
        // Clone array contents so consumers don't see local changes
        return this._opsLog.map((value) => value);
    }

    private onIncomingOpProcessed(op: ISequencedDocumentMessage): void {
        this._opsLog.push(op);

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

    /**
     * {@inheritDoc IFluidClientDebugger.getAuidienceHistory}
     */
    public getAudienceHistory(): readonly AudienceChangeLogEntry[] {
        // Clone array contents so consumers don't see local changes
        return this._audienceChangeLog.map((value) => value);
    }

    private onAudienceMemberAdded(clientId: string, client: IClient): void {
        this._audienceChangeLog.push({
            clientId,
            client,
            changeKind: "added",
            timestamp: Date.now(),
        });
        this.emit("audienceMemberAdded", clientId, client);
    }

    private onAudienceMemberRemoved(clientId: string, client: IClient): void {
        this._audienceChangeLog.push({
            clientId,
            client,
            changeKind: "removed",
            timestamp: Date.now(),
        });
        this.emit("audienceMemberRemoved", clientId, client);
    }

    // #endregion

    // #region User actions

    /**
     * {@inheritDoc IFluidClientDebugger.disconnectContainer}
     */
    public disconnectContainer(): void {
        // TODO: Provide along reason string once API is updated to accept one.
        this.container.disconnect();
    }

    /**
     * {@inheritDoc IFluidClientDebugger.tryConnectContainer}
     */
    public tryConnectContainer(): void {
        this.container.connect();
    }

    /**
     * {@inheritDoc IFluidClientDebugger.closeContainer}
     */
    public closeContainer(): void {
        // TODO: Provide reason string if/when the close API is updated to accept non-error "reason"s.
        this.container.close();
    }

    // #endregion

    /**
     * {@inheritDoc IFluidClientDebugger.dispose}
     */
    public dispose(): void {
        // Bind Container events
        this.container.off("connected", (clientId) => this.onContainerConnected(clientId));
        this.container.off("disconnected", () => this.onContainerDisconnected());
        this.container.off("closed", (error) => this.onContainerClosed(error));
        this.container.off("op", (op) => this.onIncomingOpProcessed(op));
        this.container.off("dirty", () => this.onContainerDirty());
        this.container.off("saved", () => this.onContainerSaved());

        // Bind Audience events
        this.audience.off("addMember", this.audienceMemberAddedHandler);
        this.audience.off("removeMember", this.audienceMemberRemovedHandler);

        this._disposed = true;
    }

    /**
     * {@inheritDoc @fluidframework/common-definitions#IDisposable.disposed}
     */
    public get disposed(): boolean {
        this.debuggerDisposedHandler(); // Notify consumers that the debugger has been disposed.
        return this._disposed;
    }
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDisposable, IEvent, IEventProvider } from "@fluidframework/common-definitions";
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

import { AudienceChangeLogEntry, ConnectionStateChangeLogEntry } from "./Logs";

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

    /**
     * Emitted when the {@link IFluidClientDebugger} itself has been disposed.
     *
     * @see {@link IFluidClientDebugger.dispose}
     */
    (event: "debuggerDisposed", listener: () => void);
}

/**
 * Fluid debug session associated with a Fluid Client via its
 * {@link @fluidframework/container-definitions#IContainer} and
 * {@link @fluidframework/container-definitions#IAudience}.
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

    /**
     * Data contents of the Container.
     *
     * @remarks This map is assumed to be immutable. The debugger will not make any modifications to
     * its contents.
     */
    readonly containerData: Record<string, IFluidLoadable>;

    // #region Container data

    /**
     * Gets the session user's {@link @fluidframework/container-definitions#IContainer.clientId}.
     *
     * @remarks Will be undefined when the Container is not connected.
     */
    getClientId(): string | undefined;

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
     * Gets the Container's {@link @fluidframework/container-definitions#IContainer.resolvedUrl}.
     */
    getContainerResolvedUrl(): IResolvedUrl | undefined;

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
    getOpsLog(): readonly ISequencedDocumentMessage[];

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
    getAudienceHistory(): readonly AudienceChangeLogEntry[];

    // #endregion

    // #region User actions

    /**
     * Manually {@link @fluidframework/container-definitions#IContainer.disconnect | disconnect} the Container.
     */
    disconnectContainer(): void;

    /**
     * Manually attempt to {@link @fluidframework/container-definitions#IContainer.connect | connect} the Container.
     *
     * @remarks There is no guarantee that this operation will succeed.
     */
    tryConnectContainer(): void;

    /**
     * Manually {@link @fluidframework/container-definitions#IContainer.close | close} (dispose) the Container.
     *
     * @remarks Note: this cannot be undone. If you call this, you will need to restart your application'
     * Container session.
     */
    closeContainer(): void;

    // #endregion

    /**
     * Disposes the debugger session.
     * All data recording will stop, and no further state change events will be emitted.
     */
    dispose(): void;
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

    /**
     * Data belonging to the Container.
     *
     * @remarks The debugger will not mutate this data.
     */
    containerData: Record<string, IFluidLoadable>;
}

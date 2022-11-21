/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDisposable, IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { IClient } from "@fluidframework/protocol-definitions";

import { MemberChangeKind } from "./Audience";
import { AudienceChangeLogEntry, ConnectionStateChangeLogEntry } from "./Logs";

// TODOs:
// - Data recording configuration (what things the user wishes to subscribe to)

/**
 * Events emitted by {@link IFluidClientDebugger}.
 *
 * @internal
 */
export interface IFluidClientDebuggerEvents extends IEvent {
	// #region Container-related events

	/**
	 * Emitted when the {@link @fluidframework/container-definitions#IContainer}'s becomes "attached" to the Fluid service.
	 *
	 * @remarks
	 *
	 * Signals that the following items have been updated:
	 *
	 * - {@link IFluidClientDebugger.isContainerAttached}
	 *
	 * - {@link IFluidClientDebugger.getContainerResolvedUrl}
	 *
	 * Once attached, the state will not change again for the lifetime of the Container.
	 */
	(event: "containerAttached", listener: () => void): void;

	/**
	 * Emitted when the {@link @fluidframework/container-definitions#IContainer} becomes
	 * {@link @fluidframework/container-definitions#(ConnectionState:namespace).Connected | connected}
	 * to the Fluid service.
	 *
	 * @remarks
	 *
	 * Signals that the following items have been updated:
	 *
	 * - {@link IFluidClientDebugger.isContainerConnected}
	 *
	 * - {@link IFluidClientDebugger.getContainerConnectionLog}
	 */
	(event: "containerConnected", listener: (clientId: string) => void): void;

	/**
	 * Emitted when the {@link @fluidframework/container-definitions#IContainer} becomes
	 * {@link @fluidframework/container-definitions#(ConnectionState:namespace).Disconnected | disconnected}
	 * from the Fluid service.
	 *
	 * @remarks
	 *
	 * Signals that the following items have been updated:
	 *
	 * - {@link IFluidClientDebugger.isContainerConnected}
	 *
	 * - {@link IFluidClientDebugger.getContainerConnectionLog}
	 */
	(event: "containerDisconnected", listener: () => void): void;

	/**
	 * Emitted when the Container is closed, which permanently disables it.
	 *
	 * @remarks
	 *
	 * Listener parameters:
	 *
	 * - `error`: If container was closed due to error (as opposed to an explicit call to
	 * {@link @fluidframework/container-definitions#IContainer.close}), this contains further details
	 * about the error that caused the closure.
	 *
	 * Signals that {@link IFluidClientDebugger.isContainerClosed} has transitioned from `false` to `true`.
	 * Once closed, all Container events will cease, and no further debugger state transitions will occur.
	 */
	(event: "containerClosed", listener: (error?: ICriticalContainerError) => void);

	/**
	 * Emitted when the Container has new pending local operations (ops)
	 * (i.e. {@link @fluidframework/container-definitions#IContainer.dirty} is `true`).
	 *
	 * @remarks
	 *
	 * Signals that {@link IFluidClientDebugger.isContainerDirty} has transitioned from `false` to `true`.
	 */
	(event: "containerDirty", listener: () => void);

	/**
	 * Emitted when the Container finishes processing all pending local operations (ops)
	 * (i.e. {@link @fluidframework/container-definitions#IContainer.dirty} is `false`).
	 *
	 * @remarks
	 *
	 * Signals that {@link IFluidClientDebugger.isContainerDirty} has transitioned from `true` to `false`.
	 */
	(event: "containerSaved", listener: () => void);

	// #endregion

	/**
	 * Emitted when a new member is added to or removed from the Audience.
	 *
	 * @remarks
	 *
	 * Signals that the following items have been updated:
	 *
	 * - {@link IFluidClientDebugger.getAudienceMembers}
	 *
	 * - {@link IFluidClientDebugger.getAudienceHistory}
	 *
	 * Listener parameters:
	 *
	 * - `change`: Whether the member was added to or removed from the Audience.
	 *
	 * - `clientId`: The unique ID of the newly added member client.
	 *
	 * - `client`: The newly added member client.
	 */
	(
		event: "audienceMemberChange",
		listener: (change: MemberChangeKind, clientId: string, client: IClient) => void,
	);

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
 *
 * @internal
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
	 * @remarks
	 *
	 * This map is assumed to be immutable. The debugger will not make any modifications to its contents.
	 *
	 * @privateRemarks
	 *
	 * TODO: what is the right type here?
	 * We need to be able to generate serializable summaries of the data / hooks for making updates across service workers.
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
	 * Whether or not the Container is {@link @fluidframework/container-definitions#AttachState.Attached}.
	 *
	 * @remarks
	 *
	 * The `containerAttached` event signals that this has transitioned from `false` to `true`.
	 *
	 * It does not transition back for the lifetime of the Container.
	 */
	isContainerAttached(): boolean;

	/**
	 * Whether or not the Container is {@link @fluidframework/container-definitions#(ConnectionState:namespace).Disconnected}.
	 *
	 * @remarks
	 *
	 * The `containerConnected` event signals that this has transitioned from `false` to `true`.
	 *
	 * The `containerDisconnected` events signals that this has transitioned from `true` to `false`.
	 */
	isContainerConnected(): boolean;

	/**
	 * Gets the history of all ConnectionState changes since the debugger session was initialized.
	 *
	 * @remarks
	 *
	 * The `containerConnected` and `containerDisconnected` events signal that this data has changed.
	 * Consumers will need to re-call this to get the most up-to-date data.
	 */
	getContainerConnectionLog(): readonly ConnectionStateChangeLogEntry[];

	/**
	 * Gets the Container's {@link @fluidframework/container-definitions#IContainer.resolvedUrl}.
	 *
	 * @remarks
	 *
	 * Will be `undefined` iff {@link IFluidClientDebugger.isContainerAttached} is `false`.
	 *
	 * The `containerAttached` event signals that this data has become available.
	 * It will remain available for lifetime of the Container.
	 */
	getContainerResolvedUrl(): IResolvedUrl | undefined;

	/**
	 * Whether or not the Container is currently {@link @fluidframework/container-definitions#IContainer.isDirty | dirty}.
	 *
	 * @remarks
	 *
	 * The `containerDirty` event signals that this has transitioned from `false` to `true`.
	 *
	 * The `containerSaved` event signals that this has transitioned from `true` to `false`.
	 */
	isContainerDirty(): boolean;

	/**
	 * Whether or not the Container has been {@link @fluidframework/container-definitions#IContainer.disposed}.
	 *
	 * @remarks
	 *
	 * The `containerClosed` event signals that this has transitioned from `false` to `true`.
	 * It will never transition back.
	 */
	isContainerClosed(): boolean;

	// #endregion

	// #region Audience data

	/**
	 * Gets all of the Audience's {@link @fluidframework/container-definitions#IAudience.getMembers | members}.
	 *
	 * @remarks
	 *
	 * The `audienceMemberChange` event signals that this data has been updated.
	 * Consumers will need to re-call this to get the most up-to-date data.
	 */
	getAudienceMembers(): Map<string, IClient>;

	/**
	 * Historical log of audience member changes.
	 *
	 * @remarks
	 *
	 * The `audienceMemberChange` event signals that this data has been updated.
	 * Consumers will need to re-call this to get the most up-to-date data.
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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IAudience, IContainer } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { IClient } from "@fluidframework/protocol-definitions";

import { IFluidClientDebugger, IFluidClientDebuggerEvents } from "./IFluidClientDebugger";
import { AudienceChangeLogEntry, ConnectionStateChangeLogEntry } from "./Logs";
import { FluidClientDebuggerProps } from "./Registry";

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
	 * {@inheritDoc FluidClientDebuggerProps.container}
	 */
	public readonly container: IContainer;

	/**
	 * {@inheritDoc FluidClientDebuggerProps.audience}
	 */
	public get audience(): IAudience {
		return this.container.audience;
	}

	/**
	 * {@inheritDoc IFluidClientDebugger.containerData}
	 */
	public readonly containerData?: IFluidLoadable | Record<string, IFluidLoadable>;

	/**
	 * {@inheritDoc IFluidClientDebugger.containerNickname}
	 */
	public readonly containerNickname?: string;

	// #region Accumulated log state

	/**
	 * Accumulated data for {@link IFluidClientDebugger.getContainerConnectionLog}.
	 */
	private readonly _connectionStateLog: ConnectionStateChangeLogEntry[];

	/**
	 * Accumulated data for {@link IFluidClientDebugger.getAudienceHistory}.
	 */
	private readonly _audienceChangeLog: AudienceChangeLogEntry[];

	// #endregion

	// #region Container-related event handlers

	private readonly containerConnectedHandler = (clientId: string): void => {
		this._connectionStateLog.push({
			newState: ConnectionState.Connected,
			timestamp: Date.now(),
			clientId,
		});
	};

	private readonly containerDisconnectedHandler = (): void => {
		this._connectionStateLog.push({
			newState: ConnectionState.Disconnected,
			timestamp: Date.now(),
			clientId: undefined,
		});
	};

	// #endregion

	// #region Audience-related event handlers

	private readonly audienceMemberAddedHandler = (clientId: string, client: IClient): void => {
		this._audienceChangeLog.push({
			clientId,
			client,
			changeKind: "added",
			timestamp: Date.now(),
		});
	};

	private readonly audienceMemberRemovedHandler = (clientId: string, client: IClient): void => {
		this._audienceChangeLog.push({
			clientId,
			client,
			changeKind: "removed",
			timestamp: Date.now(),
		});
	};

	// #endregion

	private readonly debuggerDisposedHandler = (): boolean => this.emit("disposed");

	/**
	 * Whether or not the instance has been disposed yet.
	 *
	 * @remarks Not related to Container disposal.
	 *
	 * @see {@link IFluidClientDebugger.dispose}
	 */
	private _disposed: boolean;

	public constructor(props: FluidClientDebuggerProps) {
		super();

		this.containerId = props.containerId;
		this.containerData = props.containerData;
		this.container = props.container;
		this.containerNickname = props.containerNickname;

		// TODO: would it be useful to log the states (and timestamps) at time of debugger intialize?
		this._connectionStateLog = [];
		this._audienceChangeLog = [];

		// Bind Container events required for change-logging
		this.container.on("connected", this.containerConnectedHandler);
		this.container.on("disconnected", this.containerDisconnectedHandler);

		// Bind Audience events required for change-logging
		this.audience.on("addMember", this.audienceMemberAddedHandler);
		this.audience.on("removeMember", this.audienceMemberRemovedHandler);

		this._disposed = false;
	}

	/**
	 * {@inheritDoc IFluidClientDebugger.getConnectionStateLog}
	 */
	public getContainerConnectionLog(): readonly ConnectionStateChangeLogEntry[] {
		// Clone array contents so consumers don't see local changes
		return this._connectionStateLog.map((value) => value);
	}

	/**
	 * {@inheritDoc IFluidClientDebugger.getAuidienceHistory}
	 */
	public getAudienceHistory(): readonly AudienceChangeLogEntry[] {
		// Clone array contents so consumers don't see local changes
		return this._audienceChangeLog.map((value) => value);
	}

	/**
	 * {@inheritDoc IFluidClientDebugger.dispose}
	 */
	public dispose(): void {
		// Unbind Container events
		this.container.off("connected", this.containerConnectedHandler);
		this.container.off("disconnected", this.containerDisconnectedHandler);

		// Unbind Audience events
		this.audience.off("addMember", this.audienceMemberAddedHandler);
		this.audience.off("removeMember", this.audienceMemberRemovedHandler);

		this.debuggerDisposedHandler(); // Notify consumers that the debugger has been disposed.

		this._disposed = true;
	}

	/**
	 * {@inheritDoc @fluidframework/common-definitions#IDisposable.disposed}
	 */
	public get disposed(): boolean {
		return this._disposed;
	}
}

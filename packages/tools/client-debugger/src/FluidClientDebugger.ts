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
import { IClient } from "@fluidframework/protocol-definitions";

import { MemberChangeKind } from "./Audience";
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
	 * Accumulated data for {@link IFluidClientDebugger.getContainerConnectionLog}.
	 */
	private readonly _connectionStateLog: ConnectionStateChangeLogEntry[];

	/**
	 * Accumulated data for {@link IFluidClientDebugger.getAudienceHistory}.
	 */
	private readonly _audienceChangeLog: AudienceChangeLogEntry[];

	// #endregion

	// #region Container-related event handlers

	private readonly containerAttachedHandler = (): void => {
		this.emit("containerAttached");
	};

	private readonly containerConnectedHandler = (clientId: string): void => {
		this._connectionStateLog.push({
			newState: ConnectionState.Connected,
			timestamp: Date.now(),
			clientId,
		});
		this.emit("containerConnected", clientId);
	};

	private readonly containerDisconnectedHandler = (): void => {
		this._connectionStateLog.push({
			newState: ConnectionState.Disconnected,
			timestamp: Date.now(),
			clientId: undefined,
		});
		this.emit("containerDisconnected");
	};

	private readonly containerDirtyHandler = (): void => {
		// TODO: dirtiness history log?
		this.emit("containerDirty");
	};

	private readonly containerSavedHandler = (): void => {
		// TODO: dirtiness history log?
		this.emit("containerSaved");
	};

	private readonly containerClosedHandler = (error?: ICriticalContainerError): void => {
		this.emit("containerClosed", error);
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
		this.emit("audienceMemberChange", MemberChangeKind.Added, clientId, client);
	};

	private readonly audienceMemberRemovedHandler = (clientId: string, client: IClient): void => {
		this._audienceChangeLog.push({
			clientId,
			client,
			changeKind: "removed",
			timestamp: Date.now(),
		});
		this.emit("audienceMemberChange", MemberChangeKind.Removed, clientId, client);
	};

	// #endregion

	private readonly debuggerDisposedHandler = (): boolean => this.emit("debuggerDisposed");

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
		containerData: Record<string, IFluidLoadable>,
	) {
		super();

		this.containerId = containerId;
		this.containerData = containerData;
		this.container = container;
		this.audience = container.audience;

		// TODO: would it be useful to log the states (and timestamps) at time of debugger intialize?
		this._connectionStateLog = [];
		this._audienceChangeLog = [];

		// Bind Container events
		this.container.on("attached", this.containerAttachedHandler);
		this.container.on("connected", this.containerConnectedHandler);
		this.container.on("disconnected", this.containerDisconnectedHandler);
		this.container.on("closed", this.containerClosedHandler);
		this.container.on("dirty", this.containerDirtyHandler);
		this.container.on("saved", this.containerSavedHandler);

		// Bind Audience events
		this.audience.on("addMember", this.audienceMemberAddedHandler);
		this.audience.on("removeMember", this.audienceMemberRemovedHandler);

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
	public isContainerAttached(): boolean {
		return this.container.attachState === AttachState.Attached;
	}

	/**
	 * {@inheritDoc IFluidClientDebugger.getConnectionState}
	 */
	public isContainerConnected(): boolean {
		return this.container.connectionState === ConnectionState.Connected;
	}

	/**
	 * {@inheritDoc IFluidClientDebugger.getConnectionStateLog}
	 */
	public getContainerConnectionLog(): readonly ConnectionStateChangeLogEntry[] {
		// Clone array contents so consumers don't see local changes
		return this._connectionStateLog.map((value) => value);
	}

	/**
	 * {@inheritDoc IFluidClientDebugger.getContainerResolvedUrl}
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

    /**
     * return contianer page all content here.
     */
    public async getContainerContent(): Promise<string> {
        return this.getRuntimeObjectFromContainer();
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
		// Unbind Container events
		this.container.off("attached", this.containerAttachedHandler);
		this.container.off("connected", this.containerConnectedHandler);
		this.container.off("disconnected", this.containerDisconnectedHandler);
		this.container.off("closed", this.containerClosedHandler);
		this.container.off("dirty", this.containerDirtyHandler);
		this.container.off("saved", this.containerSavedHandler);

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

    public async getRuntimeObjectFromContainer(): Promise<string> {
        const response = await this.container.request({ url: "/", headers: { containerRef: this.container }});
        console.log('response.value?.runtime?.entryPoint?.absolutePath');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
        console.log(response.value?.runtime?.entryPoint?.absolutePath);
        // return response.value?.runtime?.entrypoint;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
        return response.value?.runtime?.entryPoint?.absolutePath;
    }
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { IClient } from "@fluidframework/protocol-definitions";

import {
	AudienceChangeLogEntry,
	ClientDebuggerSummary,
	ConnectionStateChangeLogEntry,
	IFluidClientDebugger,
	IFluidClientDebuggerEvents,
} from "@fluid-tools/client-debugger";

/**
 * {@link @fluid-tools/client-debugger#IFluidClientDebugger} implementation which listens to window
 * messages to populate its data and fire its own events.
 *
 * @remarks
 *
 * Messages are posted by the debugger instance on the client side.
 */
export class ExtensionDebugger
	extends TypedEventEmitter<IFluidClientDebuggerEvents>
	implements IFluidClientDebugger
{
	/**
	 * {@inheritDoc @fluid-tools/client-debugger#IFluidClientDebugger.containerId}
	 */
	public readonly containerId: string;

	/**
	 * {@inheritDoc @fluid-tools/client-debugger#IFluidClientDebugger.containerData}
	 */
	public readonly containerData: Record<string, IFluidLoadable>;

	// TODO: not readonly
	private readonly clientId: string | undefined;

	private readonly containerAttached: boolean;
	private readonly containerConnected: boolean;
	private readonly containerDirty: boolean;
	private readonly containerClosed: boolean;

	private readonly containerResolvedUrl: IResolvedUrl | undefined;
	private readonly containerConnectionLog: ConnectionStateChangeLogEntry[];

	private readonly audienceMembers: Map<string, IClient>;
	private readonly audienceHistory: AudienceChangeLogEntry[];

	/**
	 * Whether or not the instance has been disposed yet.
	 *
	 * @remarks Not related to Container disposal.
	 *
	 * @see {@link IFluidClientDebugger.dispose}
	 */
	private _disposed: boolean;

	constructor(summary: ClientDebuggerSummary) {
		super();

		this.containerId = summary.containerId;
		this.containerData = {}; // TODO: summary.containerData;
		this.clientId = summary.clientId;
		this.containerAttached = summary.isContainerAttached;
		this.containerConnected = summary.isContainerConnected;
		this.containerDirty = summary.isContainerDirty;
		this.containerClosed = summary.isContainerClosed;
		this.containerResolvedUrl = summary.containerResolvedUrl;
		this.containerConnectionLog = [...summary.containerConnectionLog];
		this.audienceMembers = new Map<string, IClient>(summary.audienceMembers);
		this.audienceHistory = [...summary.audienceHistory];

		this._disposed = false;
	}

	/**
	 * {@inheritDoc @fluid-tools/client-debugger#IFluidClientDebugger.getClientId}
	 */
	public getClientId(): string | undefined {
		return this.clientId;
	}

	/**
	 * {@inheritDoc @fluid-tools/client-debugger#IFluidClientDebugger.isContainerAttached}
	 */
	public isContainerAttached(): boolean {
		return this.containerAttached;
	}

	/**
	 * {@inheritDoc @fluid-tools/client-debugger#IFluidClientDebugger.isContainerConnected}
	 */
	public isContainerConnected(): boolean {
		return this.containerConnected;
	}

	/**
	 * {@inheritDoc @fluid-tools/client-debugger#IFluidClientDebugger.getContainerConnectionLog}
	 */
	public getContainerConnectionLog(): readonly ConnectionStateChangeLogEntry[] {
		return [...this.containerConnectionLog];
	}

	/**
	 * {@inheritDoc @fluid-tools/client-debugger#IFluidClientDebugger.getContainerResolvedUrl}
	 */
	public getContainerResolvedUrl(): IResolvedUrl | undefined {
		return this.containerResolvedUrl;
	}

	/**
	 * {@inheritDoc @fluid-tools/client-debugger#IFluidClientDebugger.isContainerDirty}
	 */
	public isContainerDirty(): boolean {
		return this.containerDirty;
	}

	/**
	 * {@inheritDoc @fluid-tools/client-debugger#IFluidClientDebugger.isContainerClosed}
	 */
	public isContainerClosed(): boolean {
		return this.containerClosed;
	}

	/**
	 * {@inheritDoc @fluid-tools/client-debugger#IFluidClientDebugger.getAudienceMembers}
	 */
	public getAudienceMembers(): Map<string, IClient> {
		return new Map<string, IClient>(this.audienceMembers.entries());
	}

	/**
	 * {@inheritDoc @fluid-tools/client-debugger#IFluidClientDebugger.getAudienceHistory}
	 */
	public getAudienceHistory(): readonly AudienceChangeLogEntry[] {
		return [...this.audienceHistory];
	}

	/**
	 * {@inheritDoc @fluid-tools/client-debugger#IFluidClientDebugger.disconnectContainer}
	 */
	public disconnectContainer(): void {
		throw new Error("TODO: post message");
	}

	/**
	 * {@inheritDoc @fluid-tools/client-debugger#IFluidClientDebugger.tryConnectContainer}
	 */
	public tryConnectContainer(): void {
		throw new Error("TODO: post message");
	}

	/**
	 * {@inheritDoc @fluid-tools/client-debugger#IFluidClientDebugger.closeContainer}
	 */
	public closeContainer(): void {
		throw new Error("TODO: post message");
	}

	// TODO: base abstract class to encapsulate some of this duplicated stuff?
	/**
	 * {@inheritDoc @fluid-tools/client-debugger#IFluidClientDebugger.summarizeCurrentState}
	 */
	public summarizeCurrentState(): ClientDebuggerSummary {
		return {
			containerId: this.containerId,
			// TODO: containerData
			clientId: this.getClientId(),
			isContainerAttached: this.isContainerAttached(),
			isContainerConnected: this.isContainerConnected(),
			isContainerDirty: this.isContainerDirty(),
			isContainerClosed: this.isContainerClosed(),
			containerConnectionLog: this.getContainerConnectionLog(),
			containerResolvedUrl: this.getContainerResolvedUrl(),
			audienceMembers: [...this.getAudienceMembers().entries()],
			audienceHistory: this.getAudienceHistory(),
		};
	}

	/**
	 * {@inheritDoc @fluid-tools/client-debugger#IFluidClientDebugger.dispose}
	 */
	public dispose(): void {
		// TODO: post disposal message and wait for ack before disposing.
		this._disposed = false;
	}

	/**
	 * {@inheritDoc @fluidframework/common-definitions#IDisposable.disposed}
	 */
	public get disposed(): boolean {
		return this._disposed;
	}
}

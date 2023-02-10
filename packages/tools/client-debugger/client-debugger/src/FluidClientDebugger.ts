/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IAudience, IContainer } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { IClient } from "@fluidframework/protocol-definitions";
import { ContainerStateMetadata } from "./ContainerMetadata";

import { IFluidClientDebugger, IFluidClientDebuggerEvents } from "./IFluidClientDebugger";
import { AudienceChangeLogEntry, ConnectionStateChangeLogEntry } from "./Logs";
import {
	ContainerStateChangeMessage,
	debuggerMessageSource,
	GetContainerStateMessage,
	handleWindowMessage,
	IDebuggerMessage,
	InboundHandlers,
	InitiateDebuggerMessagingMessage,
	postWindowMessage,
	TerminateDebuggerMessagingMessage,
} from "./messaging";
import { FluidClientDebuggerProps } from "./Registry";

/**
 * {@inheritDoc IFluidClientDebugger}
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

	private readonly containerAttachedHandler = (): void => {
		this.postContainerStateChange();
	};

	private readonly containerConnectedHandler = (clientId: string): void => {
		this.postContainerStateChange();
		this._connectionStateLog.push({
			newState: ConnectionState.Connected,
			timestamp: Date.now(),
			clientId,
		});
	};

	private readonly containerDisconnectedHandler = (): void => {
		this.postContainerStateChange();
		this._connectionStateLog.push({
			newState: ConnectionState.Disconnected,
			timestamp: Date.now(),
			clientId: undefined,
		});
	};

	private readonly containerClosedHandler = (): void => {
		this.postContainerStateChange();
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

	// #region Window event handlers

	/**
	 * Handlers for inbound messages related to the debugger.
	 */
	private readonly inboundMessageHandlers: InboundHandlers = {
		["INITIATE_DEBUGGER_MESSAGING"]: (untypedMessage) => {
			const message = untypedMessage as InitiateDebuggerMessagingMessage;
			if (message.data.containerId === this.containerId) {
				this.postMessages = true;
				return true;
			}
			return false;
		},
		["TERMINATE_DEBUGGER_MESSAGING"]: (untypedMessage) => {
			const message = untypedMessage as TerminateDebuggerMessagingMessage;
			if (message.data.containerId === this.containerId) {
				this.postMessages = false;
				return true;
			}
			return false;
		},
		["GET_CONTAINER_STATE"]: (untypedMessage) => {
			const message = untypedMessage as GetContainerStateMessage;
			if (message.data.containerId === this.containerId) {
				this.postContainerStateChange();
				return true;
			}
			return false;
		},
	};

	/**
	 * Event handler for messages coming from the window (globalThis).
	 */
	private readonly windowMessageHandler = (
		event: MessageEvent<Partial<IDebuggerMessage>>,
	): void => {
		handleWindowMessage(event, this.inboundMessageHandlers, {
			context: `Debugger(${this.containerId})`,
		});
	};

	/**
	 * Posts a {@link ContainerStateChangeMessage} to the window (globalThis).
	 */
	private readonly postContainerStateChange = (): void => {
		this.postMessageIfActive<ContainerStateChangeMessage>({
			source: debuggerMessageSource,
			type: "CONTAINER_STATE_CHANGE",
			data: {
				containerState: this.getContainerState(),
			},
		});
	};

	// #endregion

	private readonly debuggerDisposedHandler = (): boolean => this.emit("disposed");

	/**
	 * Determines whether or not the debugger will post state change messages to the window (globalThis).
	 *
	 * @remarks Set via the {@link InitiateDebuggerMessagingMessage} message,
	 * and unset via {@link TerminateDebuggerMessagingMessage}.
	 */
	private postMessages: boolean;

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
		this.container.on("attached", this.containerAttachedHandler);
		this.container.on("connected", this.containerConnectedHandler);
		this.container.on("disconnected", this.containerDisconnectedHandler);
		this.container.on("closed", this.containerClosedHandler);

		// Bind Audience events required for change-logging
		this.audience.on("addMember", this.audienceMemberAddedHandler);
		this.audience.on("removeMember", this.audienceMemberRemovedHandler);

		// Register listener for inbound messages from the window (globalThis)
		globalThis.addEventListener("message", this.windowMessageHandler);

		this.postMessages = false;
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

	private getContainerState(): ContainerStateMetadata {
		const clientId = this.container.clientId;
		return {
			id: this.containerId,
			nickname: this.containerNickname,
			attachState: this.container.attachState,
			connectionState: this.container.connectionState,
			closed: this.container.closed,
			clientId: this.container.clientId,
			audienceId:
				clientId === undefined ? undefined : this.audience.getMember(clientId)?.user.id,
		};
	}

	/**
	 * Posts the provided message to the window (globalThis) iff {@link FluidClientDebugger.postMessages}.
	 */
	private postMessageIfActive<TMessage extends IDebuggerMessage>(message: TMessage): void {
		if (this.postMessages) {
			postWindowMessage<TMessage>(message);
		}
	}
}

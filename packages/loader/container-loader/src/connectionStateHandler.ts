/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDeltaManager } from "@fluidframework/container-definitions/internal";
import { ITelemetryBaseProperties } from "@fluidframework/core-interfaces";
import { assert, Timer } from "@fluidframework/core-utils/internal";
import { IClient, ISequencedClient } from "@fluidframework/driver-definitions";
import { IAnyDriverError } from "@fluidframework/driver-definitions/internal";
import {
	type TelemetryEventCategory,
	ITelemetryLoggerExt,
	MonitoringContext,
	PerformanceEvent,
} from "@fluidframework/telemetry-utils/internal";

import { CatchUpMonitor, ICatchUpMonitor } from "./catchUpMonitor.js";
import { ConnectionState } from "./connectionState.js";
import { IConnectionDetailsInternal, IConnectionStateChangeReason } from "./contracts.js";
import { IProtocolHandler } from "./protocol.js";

// Based on recent data, it looks like majority of cases where we get stuck are due to really slow or
// timing out ops fetches. So attempt recovery infrequently. Also fetch uses 30 second timeout, so
// if retrying fixes the problem, we should not see these events.
const JoinOpTimeoutMs = 45000;

// Timeout waiting for "self" join signal, before giving up
const JoinSignalTimeoutMs = 10000;

/** Constructor parameter type for passing in dependencies needed by the ConnectionStateHandler */
export interface IConnectionStateHandlerInputs {
	logger: ITelemetryLoggerExt;
	mc: MonitoringContext;
	/** Log to telemetry any change in state, included to Connecting */
	connectionStateChanged: (
		value: ConnectionState,
		oldState: ConnectionState,
		reason?: IConnectionStateChangeReason,
	) => void;
	/** Whether to expect the client to join in write mode on next connection */
	shouldClientJoinWrite: () => boolean;
	/** (Optional) How long should we wait on our previous client's Leave op before transitioning to Connected again */
	maxClientLeaveWaitTime: number | undefined;
	/** Log an issue encountered while in the Connecting state. details will be logged as a JSON string */
	logConnectionIssue: (
		eventName: string,
		category: TelemetryEventCategory,
		details?: ITelemetryBaseProperties,
	) => void;
	/** Callback to note that an old local client ID is still present in the Quorum that should have left and should now be considered invalid */
	clientShouldHaveLeft: (clientId: string) => void;

	/** Some critical error was hit. Container should be closed and error logged. */
	onCriticalError: (error: unknown) => void;
}

/**
 * interface that connection state handler implements
 */
export interface IConnectionStateHandler {
	readonly connectionState: ConnectionState;
	/**
	 * Pending clientID.
	 * Changes whenever socket connection is established.
	 * Resets to undefined when connection is lost
	 */
	readonly pendingClientId: string | undefined;
	/**
	 * clientId of a last established connection.
	 * Does not reset on disconnect.
	 * Changes only when new connection is established, client is fully caught up, and
	 * there is no chance to ops from previous connection (i.e. if needed, we have waited and observed leave op from previous connection)
	 */
	readonly clientId: string | undefined;

	containerSaved(): void;
	dispose(): void;
	initProtocol(protocol: IProtocolHandler): void;
	receivedConnectEvent(details: IConnectionDetailsInternal): void;
	receivedDisconnectEvent(reason: IConnectionStateChangeReason): void;
	establishingConnection(reason: IConnectionStateChangeReason): void;
	/**
	 * Switches state to disconnected when we are still establishing connection during container.load(),
	 * container connect() or reconnect and the container gets closed or disposed or disconnect happens.
	 * @param reason - reason for cancelling the connection.
	 */
	cancelEstablishingConnection(reason: IConnectionStateChangeReason): void;
}

export function createConnectionStateHandler(
	inputs: IConnectionStateHandlerInputs,
	deltaManager: IDeltaManager<any, any>,
	clientId?: string,
) {
	const config = inputs.mc.config;
	return createConnectionStateHandlerCore(
		config.getBoolean("Fluid.Container.DisableCatchUpBeforeDeclaringConnected") !== true, // connectedRaisedWhenCaughtUp
		config.getBoolean("Fluid.Container.DisableJoinSignalWait") !== true, // readClientsWaitForJoinSignal
		inputs,
		deltaManager,
		clientId,
	);
}

export function createConnectionStateHandlerCore(
	connectedRaisedWhenCaughtUp: boolean,
	readClientsWaitForJoinSignal: boolean,
	inputs: IConnectionStateHandlerInputs,
	deltaManager: IDeltaManager<any, any>,
	clientId?: string,
) {
	const factory = (handler: IConnectionStateHandlerInputs) =>
		new ConnectionStateHandler(handler, readClientsWaitForJoinSignal, clientId);

	return connectedRaisedWhenCaughtUp
		? new ConnectionStateCatchup(inputs, factory, deltaManager)
		: factory(inputs);
}

/**
 * Helper internal interface to abstract away Audience & Quorum
 */
interface IMembership {
	on(
		eventName: "addMember" | "removeMember",
		listener: (clientId: string, details: IClient | ISequencedClient) => void,
	);
	getMember(clientId: string): undefined | unknown;
}

/**
 * Class that can be used as a base class for building IConnectionStateHandler adapters / pipeline.
 * It implements both ends of communication interfaces and passes data back and forward
 */
class ConnectionStateHandlerPassThrough
	implements IConnectionStateHandler, IConnectionStateHandlerInputs
{
	protected readonly pimpl: IConnectionStateHandler;

	constructor(
		protected readonly inputs: IConnectionStateHandlerInputs,
		pimplFactory: (handler: IConnectionStateHandlerInputs) => IConnectionStateHandler,
	) {
		this.pimpl = pimplFactory(this);
	}

	/**
	 * IConnectionStateHandler
	 */
	public get connectionState() {
		return this.pimpl.connectionState;
	}
	public get pendingClientId() {
		return this.pimpl.pendingClientId;
	}
	public get clientId() {
		return this.pimpl.clientId;
	}

	public containerSaved() {
		return this.pimpl.containerSaved();
	}
	public dispose() {
		return this.pimpl.dispose();
	}
	public initProtocol(protocol: IProtocolHandler) {
		return this.pimpl.initProtocol(protocol);
	}
	public receivedDisconnectEvent(reason: IConnectionStateChangeReason<IAnyDriverError>) {
		return this.pimpl.receivedDisconnectEvent(reason);
	}

	public establishingConnection(reason: IConnectionStateChangeReason) {
		return this.pimpl.establishingConnection(reason);
	}

	public cancelEstablishingConnection(reason: IConnectionStateChangeReason) {
		return this.pimpl.cancelEstablishingConnection(reason);
	}

	public receivedConnectEvent(details: IConnectionDetailsInternal) {
		return this.pimpl.receivedConnectEvent(details);
	}

	/**
	 * IConnectionStateHandlerInputs
	 */

	public get logger() {
		return this.inputs.logger;
	}
	public get mc() {
		return this.inputs.mc;
	}
	public connectionStateChanged(
		value: ConnectionState,
		oldState: ConnectionState,
		reason?: IConnectionStateChangeReason,
	) {
		return this.inputs.connectionStateChanged(value, oldState, reason);
	}
	public shouldClientJoinWrite() {
		return this.inputs.shouldClientJoinWrite();
	}
	public get maxClientLeaveWaitTime() {
		return this.inputs.maxClientLeaveWaitTime;
	}
	public logConnectionIssue(
		eventName: string,
		category: TelemetryEventCategory,
		details?: ITelemetryBaseProperties,
	) {
		return this.inputs.logConnectionIssue(eventName, category, details);
	}
	public clientShouldHaveLeft(clientId: string) {
		return this.inputs.clientShouldHaveLeft(clientId);
	}

	public onCriticalError(error: unknown) {
		return this.inputs.onCriticalError(error);
	}
}

/**
 * Implementation of IConnectionStateHandler pass-through adapter that waits for specific sequence number
 * before raising connected event
 */
class ConnectionStateCatchup extends ConnectionStateHandlerPassThrough {
	private catchUpMonitor: ICatchUpMonitor | undefined;

	constructor(
		inputs: IConnectionStateHandlerInputs,
		pimplFactory: (handler: IConnectionStateHandlerInputs) => IConnectionStateHandler,
		private readonly deltaManager: IDeltaManager<any, any>,
	) {
		super(inputs, pimplFactory);
		this._connectionState = this.pimpl.connectionState;
	}

	private _connectionState: ConnectionState;
	public get connectionState() {
		return this._connectionState;
	}

	public connectionStateChanged(
		value: ConnectionState,
		oldState: ConnectionState,
		reason?: IConnectionStateChangeReason<IAnyDriverError>,
	) {
		switch (value) {
			case ConnectionState.Connected:
				assert(
					this._connectionState === ConnectionState.CatchingUp,
					0x3e1 /* connectivity transitions */,
				);
				// Create catch-up monitor here (not earlier), as we might get more exact info by now about how far
				// client is behind through join signal. This is only true if base layer uses signals (i.e. audience,
				// not quorum, including for "rea" connections) to make decisions about moving to "connected" state.
				// In addition to that, in its current form, doing this in ConnectionState.CatchingUp is dangerous as
				// we might get callback right away, and it will screw up state transition (as code outside of switch
				// statement will overwrite current state).
				assert(
					this.catchUpMonitor === undefined,
					0x3eb /* catchUpMonitor should be gone */,
				);
				this.catchUpMonitor = new CatchUpMonitor(
					this.deltaManager,
					this.transitionToConnectedState,
				);
				return;
			case ConnectionState.Disconnected:
				this.catchUpMonitor?.dispose();
				this.catchUpMonitor = undefined;
				break;
			// ConnectionState.EstablishingConnection state would be set when we start establishing connection
			// during container.connect() or reconnect because of an error.
			case ConnectionState.EstablishingConnection:
				assert(
					this._connectionState === ConnectionState.Disconnected,
					0x6d2 /* connectivity transition to establishing connection */,
				);
				break;
			case ConnectionState.CatchingUp:
				assert(
					this._connectionState === ConnectionState.EstablishingConnection,
					0x3e3 /* connectivity transitions */,
				);
				break;
			default:
		}
		this._connectionState = value;
		this.inputs.connectionStateChanged(value, oldState, reason);
	}

	private readonly transitionToConnectedState = () => {
		// Defensive measure, we should always be in Connecting state when this is called.
		const state = this.pimpl.connectionState;
		assert(state === ConnectionState.Connected, 0x3e5 /* invariant broken */);
		assert(this._connectionState === ConnectionState.CatchingUp, 0x3e6 /* invariant broken */);
		this._connectionState = ConnectionState.Connected;
		this.inputs.connectionStateChanged(ConnectionState.Connected, ConnectionState.CatchingUp, {
			text: "caught up",
		});
	};
}

/**
 * In the lifetime of a container, the connection will likely disconnect and reconnect periodically.
 * This class ensures that any ops sent by this container instance on previous connection are either
 * sequenced or blocked by the server before emitting the new "connected" event and allowing runtime to resubmit ops.
 *
 * Each connection is assigned a clientId by the service, and the connection is book-ended by a Join and a Leave op
 * generated by the service. Due to the distributed nature of the Relay Service, in the case of reconnect we cannot
 * make any assumptions about ordering of operations between the old and new connections - i.e. new Join op could
 * be sequenced before old Leave op (and some acks from pending ops that were in flight when we disconnected).
 *
 * The job of this class is to encapsulate the transition period during reconnect, which is identified by
 * ConnectionState.CatchingUp. Specifically, before moving to Connected state with the new clientId, it ensures that:
 *
 * a. We process the Leave op for the previous clientId. This allows us to properly handle any acks from in-flight ops
 * that got sequenced with the old clientId (we'll recognize them as local ops). After the Leave op, any other
 * pending ops can safely be submitted with the new clientId without fear of duplication in the sequenced op stream.
 *
 * b. We process the Join op for the new clientId (identified when the underlying connection was first established),
 * indicating the service is ready to sequence ops sent with the new clientId.
 *
 * c. We process all ops known at the time the underlying connection was established (so we are "caught up")
 *
 * For (a) we give up waiting after some time (same timeout as server uses), and go ahead and transition to Connected.
 *
 * For (b) we log telemetry if it takes too long, but still only transition to Connected when the Join op/signal is
 * processed.
 *
 * For (c) this is optional behavior, controlled by the parameters of receivedConnectEvent
 */
class ConnectionStateHandler implements IConnectionStateHandler {
	private _connectionState = ConnectionState.Disconnected;
	private _pendingClientId: string | undefined;

	/**
	 * Tracks that we observe the "leave" op within the timeout for our previous clientId (see comment on ConnectionStateHandler class)
	 * ! This ensures we do not switch to a new clientId until we process all potential messages from old clientId
	 * ! i.e. We will always see the "leave" op for a client after we have seen all the ops it has sent
	 * ! This check helps prevent the same op from being resubmitted by the PendingStateManager upon reconnecting
	 */
	private readonly prevClientLeftTimer: Timer;

	/**
	 * Tracks that we observe our own "join" op within the timeout after receiving a "connected" event from the DeltaManager
	 */
	private readonly joinTimer: Timer;

	private protocol?: IProtocolHandler;
	private connection?: IConnectionDetailsInternal;
	private _clientId?: string;

	/** Track how long we waited to see "leave" op for previous clientId */
	private waitEvent: PerformanceEvent | undefined;

	public get connectionState(): ConnectionState {
		return this._connectionState;
	}

	public get clientId(): string | undefined {
		return this._clientId;
	}

	public get pendingClientId(): string | undefined {
		return this._pendingClientId;
	}

	constructor(
		private readonly handler: IConnectionStateHandlerInputs,
		private readonly readClientsWaitForJoinSignal: boolean,
		clientIdFromPausedSession?: string,
	) {
		this._clientId = clientIdFromPausedSession;
		const errorHandler = (error) => this.handler.onCriticalError(error);
		this.prevClientLeftTimer = new Timer(
			// Default is 5 min for which we are going to wait for its own "leave" message. This is same as
			// the max time on server after which leave op is sent.
			this.handler.maxClientLeaveWaitTime ?? 300000,
			() => {
				assert(
					this.connectionState !== ConnectionState.Connected,
					0x2ac /* "Connected when timeout waiting for leave from previous session fired!" */,
				);
				this.applyForConnectedState("timeout");
			},
			errorHandler,
		);

		this.joinTimer = new Timer(
			0, // default value is not used - startjoinTimer() explicitly provides timeout
			() => {
				// I've observed timer firing within couple ms from disconnect event, looks like
				// queued timer callback is not cancelled if timer is cancelled while callback sits in the queue.
				if (this.connectionState !== ConnectionState.CatchingUp) {
					return;
				}
				const details = {
					protocolInitialized: this.protocol !== undefined,
					pendingClientId: this.pendingClientId,
					clientJoined: this.hasMember(this.pendingClientId),
					waitingForLeaveOp: this.waitingForLeaveOp,
				};
				this.handler.logConnectionIssue(
					this.connection?.mode === "read" ? "NoJoinSignal" : "NoJoinOp", // eventName
					"error", // category
					details,
				);
			},
			errorHandler,
		);
	}

	private startjoinTimer() {
		assert(!this.joinTimer.hasTimer, 0x234 /* "has joinTimer" */);
		assert(this.connection !== undefined, 0x4b3 /* have connection */);
		this.joinTimer.start(
			this.connection.mode === "write" ? JoinOpTimeoutMs : JoinSignalTimeoutMs,
		);
	}

	private stopjoinTimer() {
		assert(this.joinTimer.hasTimer, 0x235 /* "no joinTimer" */);
		this.joinTimer.clear();
	}

	private get waitingForLeaveOp() {
		return this.prevClientLeftTimer.hasTimer;
	}

	public dispose() {
		assert(!this.joinTimer.hasTimer, 0x2a5 /* "join timer" */);
		this.prevClientLeftTimer.clear();
	}

	public containerSaved() {
		// If we were waiting for moving to Connected state, then only apply for state change. Since the container
		// is now saved and we don't have any ops to roundtrip, we can clear the timer and apply for connected state.
		if (this.waitingForLeaveOp) {
			this.prevClientLeftTimer.clear();
			this.applyForConnectedState("containerSaved");
		}
	}

	private receivedAddMemberEvent(clientId: string) {
		// This is the only one that requires the pending client ID
		if (clientId === this.pendingClientId) {
			if (this.joinTimer.hasTimer) {
				this.stopjoinTimer();
			} else if (this.shouldWaitForSelf()) {
				// timer has already fired, meaning it took too long to get join op/signal.
				// Record how long it actually took to recover.
				// This is generic event, as it by itself is not an error.
				// We also have a case where NoJoinOp happens during container boot (we do not report it as error in such case),
				// if this log statement happens after boot - we do not want to consider it error case.
				this.handler.logConnectionIssue(
					this.connection?.mode === "read" ? "ReceivedJoinSignal" : "ReceivedJoinOp", // eventName
					"generic", // category
				);
			}
			// Start the event in case we are waiting for leave or timeout.
			if (this.waitingForLeaveOp) {
				this.waitEvent = PerformanceEvent.start(this.handler.logger, {
					eventName: "WaitBeforeClientLeave",
					details: JSON.stringify({
						waitOnClientId: this._clientId,
						hadOutstandingOps: this.handler.shouldClientJoinWrite(),
					}),
				});
			}
			this.applyForConnectedState("addMemberEvent");
		}
	}

	private applyForConnectedState(
		source: "removeMemberEvent" | "addMemberEvent" | "timeout" | "containerSaved",
	) {
		assert(
			this.protocol !== undefined,
			0x236 /* "In all cases it should be already installed" */,
		);

		assert(
			!this.waitingForLeaveOp || this.hasMember(this.clientId),
			0x2e2 /* "Must only wait for leave message when clientId in quorum" */,
		);

		// Move to connected state only if:
		// 1. We have seen our own "join" op (i.e. for this.pendingClientId)
		// 2. There is no "leave" timer running, meaning this is our first connection or the previous client has left (via this.prevClientLeftTimer)
		if (
			this.pendingClientId !== this.clientId &&
			this.hasMember(this.pendingClientId) &&
			!this.waitingForLeaveOp
		) {
			this.waitEvent?.end({ source });
			this.setConnectionState(ConnectionState.Connected);
		} else {
			// Adding this event temporarily so that we can get help debugging if something goes wrong.
			// We may not see any ops due to being disconnected all that time - that's not an error!
			const error =
				source === "timeout" && this.connectionState !== ConnectionState.Disconnected;
			this.handler.logger.sendTelemetryEvent({
				eventName: "connectedStateRejected",
				category: error ? "error" : "generic",
				details: JSON.stringify({
					source,
					pendingClientId: this.pendingClientId,
					clientId: this.clientId,
					waitingForLeaveOp: this.waitingForLeaveOp,
					clientJoined: this.hasMember(this.pendingClientId),
				}),
			});
		}
	}

	private receivedRemoveMemberEvent(clientId: string) {
		// If the client which has left was us, then finish the timer.
		if (this.clientId === clientId && this.waitingForLeaveOp) {
			this.prevClientLeftTimer.clear();
			this.applyForConnectedState("removeMemberEvent");
		}
	}

	public receivedDisconnectEvent(reason: IConnectionStateChangeReason<IAnyDriverError>) {
		this.connection = undefined;
		this.setConnectionState(ConnectionState.Disconnected, reason);
	}

	public cancelEstablishingConnection(reason: IConnectionStateChangeReason) {
		assert(
			this._connectionState === ConnectionState.EstablishingConnection,
			0x6d3 /* Connection state should be EstablishingConnection */,
		);
		assert(this.connection === undefined, 0x6d4 /* No connection should be present */);
		const oldState = this._connectionState;
		this._connectionState = ConnectionState.Disconnected;
		this.handler.connectionStateChanged(ConnectionState.Disconnected, oldState, reason);
	}

	public establishingConnection(reason: IConnectionStateChangeReason) {
		const oldState = this._connectionState;
		this._connectionState = ConnectionState.EstablishingConnection;
		this.handler.connectionStateChanged(ConnectionState.EstablishingConnection, oldState, {
			text: `Establishing Connection due to ${reason.text}`,
			error: reason.error,
		});
	}

	/**
	 * Tells if need to wait for "self" to show up in audience.
	 * @returns - true if we should wait for "self" to appear in audience.
	 * false is returned only for "read" connections, and only if this.readClientsWaitForJoinSignal is false.
	 */
	private shouldWaitForSelf() {
		assert(
			this.connection !== undefined,
			0x4b4 /* all callers call here with active connection */,
		);
		return this.connection.mode === "write" || this.readClientsWaitForJoinSignal;
	}

	/**
	 * The "connect" event indicates the connection to the Relay Service is live.
	 * However, some additional conditions must be met before we can fully transition to
	 * "Connected" state. This function handles that interim period, known as "Connecting" state.
	 * @param details - Connection details returned from the Relay Service
	 * @param deltaManager - DeltaManager to be used for delaying Connected transition until caught up.
	 * If it's undefined, then don't delay and transition to Connected as soon as Leave/Join op are accounted for
	 */
	public receivedConnectEvent(details: IConnectionDetailsInternal) {
		this.connection = details;

		const oldState = this._connectionState;
		this._connectionState = ConnectionState.CatchingUp;

		// The following checks are wrong. They are only valid if user has write access to a file.
		// If user lost such access mid-session, user will not be able to get "write" connection.
		//
		// const writeConnection = details.mode === "write";
		// assert(!this.handler.shouldClientJoinWrite() || writeConnection,
		//    0x30a /* shouldClientJoinWrite should imply this is a writeConnection */);
		// assert(!this.waitingForLeaveOp || writeConnection,
		//    0x2a6 /* "waitingForLeaveOp should imply writeConnection (we need to be ready to flush pending ops)" */);

		// Stash the clientID to detect when transitioning from connecting (socket.io channel open) to connected
		// (have received the join message for the client ID)
		// This is especially important in the reconnect case. It's possible there could be outstanding
		// ops sent by this client, so we should keep the old client id until we see our own client's
		// join message. after we see the join message for our new connection with our new client id,
		// we know there can no longer be outstanding ops that we sent with the previous client id.
		this._pendingClientId = details.clientId;

		// IMPORTANT: Report telemetry after we set _pendingClientId, but before transitioning to Connected state
		this.handler.connectionStateChanged(ConnectionState.CatchingUp, oldState, details.reason);

		// Check if we need to wait for join op/signal, and if we need to wait for leave op from previous connection.
		// Pending clientId could have joined already (i.e. join op/signal already processed):
		//    We are fetching ops from storage in parallel to connecting to Relay Service,
		//    and given async processes, it's possible that we have already processed our own join message before
		//    connection was fully established.
		if (!this.hasMember(this._pendingClientId) && this.shouldWaitForSelf()) {
			// We are waiting for our own join op / signal. When it is processed
			// we'll attempt to transition to Connected state via receivedAddMemberEvent() flow.
			this.startjoinTimer();
		} else if (!this.waitingForLeaveOp) {
			// We're not waiting for Join or Leave op (if read-only connection those don't even apply),
			// go ahead and declare the state to be Connected!
			// If we are waiting for Leave op still, do nothing for now, we will transition to Connected later.
			this.setConnectionState(ConnectionState.Connected);
		}
		// else - We are waiting for Leave op still, do nothing for now, we will transition to Connected later
	}

	private setConnectionState(
		value: ConnectionState.Disconnected,
		reason: IConnectionStateChangeReason,
	): void;
	private setConnectionState(value: ConnectionState.Connected): void;
	private setConnectionState(
		value: ConnectionState.Disconnected | ConnectionState.Connected,
		reason?: IConnectionStateChangeReason,
	): void {
		if (this.connectionState === value) {
			// Already in the desired state - exit early
			this.handler.logger.sendErrorEvent({ eventName: "setConnectionStateSame", value });
			return;
		}

		const oldState = this._connectionState;
		this._connectionState = value;

		// This is the only place in code that deals with quorum. The rest works with audience
		// The code below ensures that we do not send ops until we know that old "write" client's disconnect
		// produced (and sequenced) leave op
		const currentClientInQuorum =
			this._clientId !== undefined &&
			this.protocol?.quorum?.getMember(this._clientId) !== undefined;
		if (value === ConnectionState.Connected) {
			assert(
				oldState === ConnectionState.CatchingUp,
				0x1d8 /* "Should only transition from Connecting state" */,
			);
			// Mark our old client should have left in the quorum if it's still there
			if (currentClientInQuorum) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				this.handler.clientShouldHaveLeft(this._clientId!);
			}
			this._clientId = this.pendingClientId;
		} else if (value === ConnectionState.Disconnected) {
			if (this.joinTimer.hasTimer) {
				this.stopjoinTimer();
			}

			// Only wait for "leave" message if the connected client exists in the quorum and had some non-acked ops
			// Also check if the timer is not already running as
			// we could receive "Disconnected" event multiple times without getting connected and in that case we
			// don't want to reset the timer as we still want to wait on original client which started this timer.
			if (
				currentClientInQuorum &&
				this.handler.shouldClientJoinWrite() &&
				!this.waitingForLeaveOp // same as !this.prevClientLeftTimer.hasTimer
			) {
				this.prevClientLeftTimer.restart();
			} else {
				// Adding this event temporarily so that we can get help debugging if something goes wrong.
				this.handler.logger.sendTelemetryEvent({
					eventName: "noWaitOnDisconnected",
					details: JSON.stringify({
						clientId: this._clientId,
						inQuorum: currentClientInQuorum,
						waitingForLeaveOp: this.waitingForLeaveOp,
						hadOutstandingOps: this.handler.shouldClientJoinWrite(),
					}),
				});
			}
		}

		// Report transition
		this.handler.connectionStateChanged(this._connectionState, oldState, reason);

		// Clear pending state immediately to prepare for reconnect
		// Do it after calling connectionStateChanged() above, such that our telemetry contains pendingClientId on disconnect events
		// and we can pair attempts to connect with disconnects (that's the only ID we have if connection did not move far enough before being disconnected)
		if (value === ConnectionState.Disconnected) {
			this._pendingClientId = undefined;
		}
	}

	protected get membership(): IMembership | undefined {
		// We could always use audience here.
		// This is true because Audience is a superset of quorum, i.e. when we filter Audience to "write" clients,
		// it is exactly the same as quorum! Please see asserts in Audience callbacks setup by initProtocol() enforcing that.
		return this.readClientsWaitForJoinSignal ? this.protocol?.audience : this.protocol?.quorum;
	}

	public initProtocol(protocol: IProtocolHandler) {
		this.protocol = protocol;

		this.membership?.on("addMember", (clientId, details) => {
			// This is very important constrain. We rely on it when testing presence of "self" in Audience.
			// We do not want to move to "connected" state for "write" connections when JoinSignal shows up
			// for "self" - we want to move to "connected" state only when "join" op is received.
			assert(
				(details as IClient).mode === "read" ||
					protocol.quorum.getMember(clientId) !== undefined,
				0x4b5 /* Audience is subset of quorum */,
			);
			this.receivedAddMemberEvent(clientId);
		});

		this.membership?.on("removeMember", (clientId) => {
			assert(
				protocol.quorum.getMember(clientId) === undefined,
				0x4b6 /* Audience is subset of quorum */,
			);
			this.receivedRemoveMemberEvent(clientId);
		});

		/* There is a tiny tiny race possible, where these events happen in this order:
          1. A connection is established (no "cached" mode is used, so it happens in parallel / faster than other steps)
          2. Some other client produces a summary
          3. We get "lucky" and load from that summary as our initial snapshot
          4. ConnectionStateHandler.initProtocol is called, "self" is already in the quorum.
        We could avoid this sequence (and delete test case for it) if we move connection lower in Container.load()
        */
		if (this.hasMember(this.pendingClientId)) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			this.receivedAddMemberEvent(this.pendingClientId!);
		}

		assert(
			!this.waitingForLeaveOp,
			"leave timer can't be set as we have not had access to quorum",
		);

		// This check is required for scenario of loading container from pending state, and ensuring there is no way
		// old clientId is still in the quorum (very unlikely, but you never know)
		// if we have a clientId from a previous container we need to wait for its leave message
		// This mimicks check in setConnectionState()
		// Note that we are not consulting this.handler.shouldClientJoinWrite() here
		// It could produce wrong results for stashed ops were never sent to Loader yet, and if this check
		// makes determination only on that (and not uses "dirty" events), then it can produce wrong result.
		// In most cases it does not matter, as this client already left quorum. But in really unfortunate case,
		// we might wait even if we could avoid such wait.
		if (
			this._clientId !== undefined &&
			protocol.quorum?.getMember(this._clientId) !== undefined
		) {
			this.prevClientLeftTimer.restart();
		}
	}

	protected hasMember(clientId?: string) {
		return this.membership?.getMember(clientId ?? "") !== undefined;
	}
}

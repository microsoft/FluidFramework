/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { IConnectionDetails } from "@fluidframework/container-definitions";
import { ConnectionMode, IQuorumClients, ISequencedClient } from "@fluidframework/protocol-definitions";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { assert, Timer } from "@fluidframework/common-utils";
import { ConnectionState } from "./connectionState";
import { ICatchUpMonitor } from "./catchUpMonitor";

export interface IConnectionStateHandler {
    /** Provides access to the clients currently in the quorum */
    quorumClients: () => IQuorumClients | undefined,
    /** Log to telemetry any change in state, included to Connecting */
    logConnectionStateChangeTelemetry:
        (value: ConnectionState, oldState: ConnectionState, reason?: string | undefined) => void,
    /** Whether to expect the client to join in write mode on next connection */
    shouldClientJoinWrite: () => boolean,
    /** (Optional) How long should we wait on our previous client's Leave op before transitioning to Connected again */
    maxClientLeaveWaitTime: number | undefined,
    /** Log to telemetry an issue encountered while in the Connecting state */
    logConnectionIssue: (eventName: string) => void,
    /** Callback whenever the ConnectionState changes between Disconnected and Connected */
    connectionStateChanged: () => void,
    /** Creates the monitor which will notify when op processing has caught up to the last known op as of now */
    createCatchUpMonitor: () => ICatchUpMonitor,
}

export interface ILocalSequencedClient extends ISequencedClient {
    shouldHaveLeft?: boolean;
}

const JoinOpTimeout = 45000;

/**
 * In the lifetime of a container, the connection will likely disconnect and reconnect periodically.
 * Due to the distributed nature of the ordering service, the transition from old clientId to new clientId
 * (since each reconnect gets a unique clientId) is asynchronous and the sequence of events is unpredictable.
 *
 * The job of this class is to encapsulate that transition period, which is identified by ConnectionState.Connecting.
 * Specifically, before moving to Connected state, it ensures that:
 * (A) We process the Leave op for the previous clientId. This means the server will reject any subsequent outbound ops
 *     with that clientId (important because we will likely attempt to resend pending ops with the new clientId)
 * (B) We process the Join op for the new clientId (identified when the underlying connection was first established)
 * (C) We process all ops known at the time the underlying connection was established (so we are "caught up")
 *
 * For (A) we give up waiting after some time (same timeout as server uses), and go ahead and transition to Connected.
 * For (B) we log telemetry if it takes too long, but still only transition to Connected when the Join op is processed
 * and we are added to the Quorum.
 */
export class ConnectionStateHandler {
    private _connectionState = ConnectionState.Disconnected;
    private _pendingClientId: string | undefined;
    private _clientId: string | undefined;
    private catchUpMonitor: ICatchUpMonitor | undefined;
    private readonly prevClientLeftTimer: Timer;
    private readonly joinOpTimer: Timer;

    private waitEvent: PerformanceEvent | undefined;

    public get connectionState(): ConnectionState {
        return this._connectionState;
    }

    public get connected(): boolean {
        return this.connectionState === ConnectionState.Connected;
    }

    public get clientId(): string | undefined {
        return this._clientId;
    }

    public get pendingClientId(): string | undefined {
        return this._pendingClientId;
    }

    constructor(
        private readonly handler: IConnectionStateHandler,
        private readonly logger: ITelemetryLogger,
    ) {
        this.prevClientLeftTimer = new Timer(
            // Default is 5 min for which we are going to wait for its own "leave" message. This is same as
            // the max time on server after which leave op is sent.
            this.handler.maxClientLeaveWaitTime ?? 300000,
            () => {
                assert(!this.connected,
                    0x2ac /* "Connected when timeout waiting for leave from previous session fired!" */);
                this.applyForConnectedState("timeout");
            },
        );

        // Based on recent data, it looks like majority of cases where we get stuck are due to really slow or
        // timing out ops fetches. So attempt recovery infrequently. Also fetch uses 30 second timeout, so
        // if retrying fixes the problem, we should not see these events.
        this.joinOpTimer = new Timer(
            JoinOpTimeout,
            () => {
                // I've observed timer firing within couple ms from disconnect event, looks like
                // queued timer callback is not cancelled if timer is cancelled while callback sits in the queue.
                if (this.connectionState === ConnectionState.Connecting) {
                    this.handler.logConnectionIssue("NoJoinOp");
                }
            },
        );
    }

    private startJoinOpTimer() {
        assert(!this.joinOpTimer.hasTimer, 0x234 /* "has joinOpTimer" */);
        this.joinOpTimer.start();
    }

    private stopJoinOpTimer() {
        assert(this.joinOpTimer.hasTimer, 0x235 /* "no joinOpTimer" */);
        this.joinOpTimer.clear();
    }

    public dispose() {
        assert(!this.joinOpTimer.hasTimer, 0x2a5 /* "join timer" */);
        this.prevClientLeftTimer.clear();
    }

    public containerSaved() {
        // If we were waiting for moving to Connected state, then only apply for state change. Since the container
        // is now saved and we don't have any ops to roundtrip, we can clear the timer and apply for connected state.
        if (this.prevClientLeftTimer.hasTimer) {
            this.prevClientLeftTimer.clear();
            this.applyForConnectedState("containerSaved");
        }
    }

    public receivedAddMemberEvent(clientId: string) {
        // This is the only one that requires the pending client ID
        if (clientId === this.pendingClientId) {
            if (this.joinOpTimer.hasTimer) {
                this.stopJoinOpTimer();
            } else {
                // timer has already fired, meaning it took too long to get join on.
                // Record how long it actually took to recover.
                this.handler.logConnectionIssue("ReceivedJoinOp");
            }
            // Start the event in case we are waiting for leave or timeout.
            if (this.prevClientLeftTimer.hasTimer) {
                this.waitEvent = PerformanceEvent.start(this.logger, {
                    eventName: "WaitBeforeClientLeave",
                    waitOnClientId: this._clientId,
                    hadOutstandingOps: this.handler.shouldClientJoinWrite(),
                });
            }
            this.applyForConnectedState("addMemberEvent");
        }
    }

    private applyForConnectedState(source: "removeMemberEvent" | "addMemberEvent" | "timeout" | "containerSaved") {
        const quorumClients = this.handler.quorumClients();
        assert(quorumClients !== undefined, 0x236 /* "In all cases it should be already installed" */);
        // Move to connected state only if we are in Connecting state, we have seen our join op
        // and there is no timer running which means we are not waiting for previous client to leave
        // or timeout has occured while doing so.
        if (this.pendingClientId !== this.clientId
            && this.pendingClientId !== undefined
            && quorumClients.getMember(this.pendingClientId) !== undefined
            && !this.prevClientLeftTimer.hasTimer
        ) {
            this.waitEvent?.end({ source });

            assert(this.catchUpMonitor !== undefined,
                "catchUpMonitor should always be set if pendingClientId is set");
            this.catchUpMonitor.on("caughtUp", this.transitionToConnectedState);
        } else {
            // Adding this event temporarily so that we can get help debugging if something goes wrong.
            this.logger.sendTelemetryEvent({
                eventName: "connectedStateRejected",
                category: source === "timeout" ? "error" : "generic",
                source,
                pendingClientId: this.pendingClientId,
                clientId: this.clientId,
                hasTimer: this.prevClientLeftTimer.hasTimer,
                inQuorum: quorumClients !== undefined && this.pendingClientId !== undefined
                    && quorumClients.getMember(this.pendingClientId) !== undefined,
            });
        }
    }

    public receivedRemoveMemberEvent(clientId: string) {
        // If the client which has left was us, then finish the timer.
        if (this.clientId === clientId) {
            this.prevClientLeftTimer.clear();
            this.applyForConnectedState("removeMemberEvent");
        }
    }

    public receivedDisconnectEvent(reason: string) {
        this.setConnectionState(ConnectionState.Disconnected, reason);
    }

    private readonly transitionToConnectedState = () => {
        // Defensive measure, we should always be in Connecting state when this is called.
        if (this._connectionState === ConnectionState.Connecting) {
            this.setConnectionState(ConnectionState.Connected);
        }
    };

    /**
     * The "connect" event indicates the connection to the Relay Service is live.
     * However, some additional conditions must be met before we can fully transition to
     * "Connected" state. This function handles that interim period, known as "Connecting" state.
     */
    public receivedConnectEvent(
        connectionMode: ConnectionMode,
        details: IConnectionDetails,
    ) {
        const oldState = this._connectionState;
        this._connectionState = ConnectionState.Connecting;
        const writeConnection = connectionMode === "write";

        // Defensive measure in case catchUpMonitor from previous connection attempt wasn't already cleared
        this.catchUpMonitor?.dispose();

        // Note that this may be undefined since the connection is established proactively on load
        // and the quorum may still be under initialization.
        const quorumClients: IQuorumClients | undefined = this.handler.quorumClients();

        // Stash the clientID to detect when transitioning from connecting (socket.io channel open) to connected
        // (have received the join message for the client ID)
        // This is especially important in the reconnect case. It's possible there could be outstanding
        // ops sent by this client, so we should keep the old client id until we see our own client's
        // join message. after we see the join message for our new connection with our new client id,
        // we know there can no longer be outstanding ops that we sent with the previous client id.
        this._pendingClientId = details.clientId;

        // We will want to catch up to known ops as of now before transitioning to Connected state
        this.catchUpMonitor = this.handler.createCatchUpMonitor();

        // This pending clientId could be in the quorum already (i.e. join op already processed).
        // We are fetching ops from storage in parallel to connecting to Relay Service,
        // and given async processes, it's possible that we have already processed our own join message before
        // connection was fully established.
// <<<<<<< HEAD
        const pendingClientAlreadyInQuorum = quorumClients?.getMember(this._pendingClientId) !== undefined;

        // IMPORTANT: Report telemetry after we set _pendingClientId, but before transitioning to Connected state
        this.handler.logConnectionStateChangeTelemetry(ConnectionState.Connecting, oldState);

        // Prepare to transition to Connected state, which may happen elsewhere once all preconditions are met
        if (writeConnection && !pendingClientAlreadyInQuorum) {
            // Previous client left, and we are waiting for our own join op. When it is processed we'll join the quorum
            // and attempt to transition to Connected state via receivedAddMemberEvent.
// =======
        // // Note that we might be still initializing quorum - connection is established proactively on load!
        // if (quorumClients?.getMember(details.clientId) !== undefined
        //     || connectionMode === "read"
        // ) {
        //    assert(!this.prevClientLeftTimer.hasTimer, 0x2a6 /* "there should be no timer for 'read' connections" */);
        //     this.setConnectionState(ConnectionState.Connected);
        // } else if (connectionMode === "write") {
// >>>>>>> origin/main
            this.startJoinOpTimer();
        } else if (this.prevClientLeftTimer.hasTimer) {
            // Nothing to do now - when the previous client is removed from the quorum
            // we will attempt to transition to Connected state via receivedRemoveMemberEvent
            assert(writeConnection, 0x2a6 /* "There should be no timer for 'read' connections" */);
        } else {
            // We're not waiting for Leave or Join op, but we do need to wait until we are caught up (to now-known ops)
            // before transitioning to Connected state.
            this.catchUpMonitor.on("caughtUp", this.transitionToConnectedState);
        }
    }

    /** Clear all the state used during the Connecting phase (set in receivedConnectEvent) */
    private clearPendingConnectionState() {
        this._pendingClientId = undefined;

        this.catchUpMonitor?.dispose();
        this.catchUpMonitor = undefined;

        if (this.joinOpTimer.hasTimer) {
            this.stopJoinOpTimer();
        }
    }

    private setConnectionState(value: ConnectionState.Disconnected, reason: string): void;
    private setConnectionState(value: ConnectionState.Connected): void;
    private setConnectionState(value: ConnectionState, reason?: string): void {
        if (this.connectionState === value) {
            // Already in the desired state - exit early
            this.logger.sendErrorEvent({ eventName: "setConnectionStateSame", value });
            return;
        }

        const oldState = this._connectionState;
        this._connectionState = value;
        const quorumClients = this.handler.quorumClients();
        let client: ILocalSequencedClient | undefined;
        if (this._clientId !== undefined) {
            client = quorumClients?.getMember(this._clientId);
        }
        if (value === ConnectionState.Connected) {
            assert(oldState === ConnectionState.Connecting,
                0x1d8 /* "Should only transition from Connecting state" */);
            // Mark our old client should have left in the quorum if it's still there
            if (client !== undefined) {
                client.shouldHaveLeft = true;
            }
            this._clientId = this.pendingClientId;
        } else if (value === ConnectionState.Disconnected) {
            // Clear pending state immediately to prepare for reconnect
            this.clearPendingConnectionState();

            // Only wait for "leave" message if the connected client exists in the quorum because only the write
            // client will exist in the quorum and only for those clients we will receive "removeMember" event and
            // the client has some unacked ops.
            // Also server would not accept ops from read client. Also check if the timer is not already running as
            // we could receive "Disconnected" event multiple times without getting connected and in that case we
            // don't want to reset the timer as we still want to wait on original client which started this timer.
            if (client !== undefined
                && this.handler.shouldClientJoinWrite()
                && this.prevClientLeftTimer.hasTimer === false
            ) {
                this.prevClientLeftTimer.restart();
            } else {
                // Adding this event temporarily so that we can get help debugging if something goes wrong.
                this.logger.sendTelemetryEvent({
                    eventName: "noWaitOnDisconnected",
                    inQuorum: client !== undefined,
                    hasTimer: this.prevClientLeftTimer.hasTimer,
                    shouldClientJoinWrite: this.handler.shouldClientJoinWrite(),
                });
            }
        }

        // Report transition before we propagate event across layers
        this.handler.logConnectionStateChangeTelemetry(this._connectionState, oldState, reason);

        // Propagate event across layers
        this.handler.connectionStateChanged();
    }
}

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

export interface IConnectionStateHandler {
    quorumClients: () => IQuorumClients | undefined;
    logConnectionStateChangeTelemetry: (
        value: ConnectionState,
        oldState: ConnectionState,
        reason?: string | undefined
    ) => void;
    shouldClientJoinWrite: () => boolean;
    maxClientLeaveWaitTime: number | undefined;
    logConnectionIssue: (eventName: string) => void;
    connectionStateChanged: () => void;
}

export interface ILocalSequencedClient extends ISequencedClient {
    shouldHaveLeft?: boolean;
}

const JoinOpTimer = 45000;

export class ConnectionStateHandler {
    private _connectionState = ConnectionState.Disconnected;
    private _pendingClientId: string | undefined;
    private _clientId: string | undefined;
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
            JoinOpTimer,
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
            this.setConnectionState(ConnectionState.Connected);
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
        if (this.joinOpTimer.hasTimer) {
            this.stopJoinOpTimer();
        }
        this.setConnectionState(ConnectionState.Disconnected, reason);
    }

    public receivedConnectEvent(
        connectionMode: ConnectionMode,
        details: IConnectionDetails,
    ) {
        const oldState = this._connectionState;
        this._connectionState = ConnectionState.Connecting;

        // Stash the clientID to detect when transitioning from connecting (socket.io channel open) to connected
        // (have received the join message for the client ID)
        // This is especially important in the reconnect case. It's possible there could be outstanding
        // ops sent by this client, so we should keep the old client id until we see our own client's
        // join message. after we see the join message for out new connection with our new client id,
        // we know there can no longer be outstanding ops that we sent with the previous client id.
        this._pendingClientId = details.clientId;

        // Report telemetry after we set client id, but before transitioning to Connected state below!
        this.handler.logConnectionStateChangeTelemetry(ConnectionState.Connecting, oldState);

        const quorumClients = this.handler.quorumClients();
        // Check if we already processed our own join op through delta storage!
        // we are fetching ops from storage in parallel to connecting to ordering service
        // Given async processes, it's possible that we have already processed our own join message before
        // connection was fully established.
        // Note that we might be still initializing quorum - connection is established proactively on load!
        if (quorumClients?.getMember(details.clientId) !== undefined
            || connectionMode === "read"
        ) {
            assert(!this.prevClientLeftTimer.hasTimer, 0x2a6 /* "there should be no timer for 'read' connections" */);
            this.setConnectionState(ConnectionState.Connected);
        } else if (connectionMode === "write") {
            this.startJoinOpTimer();
        }
    }

    private setConnectionState(value: ConnectionState.Disconnected, reason: string);
    private setConnectionState(value: ConnectionState.Connected);
    private setConnectionState(value: ConnectionState, reason?: string) {
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
            // Important as we process our own joinSession message through delta request
            this._pendingClientId = undefined;
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

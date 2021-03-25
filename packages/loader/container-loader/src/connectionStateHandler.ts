/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent, ITelemetryLogger } from "@fluidframework/common-definitions";
import { IConnectionDetails } from "@fluidframework/container-definitions";
import { ProtocolOpHandler } from "@fluidframework/protocol-base";
import { ConnectionMode, ISequencedClient } from "@fluidframework/protocol-definitions";
import { EventEmitterWithErrorHandling, PerformanceEvent } from "@fluidframework/telemetry-utils";
import { assert, Timer } from "@fluidframework/common-utils";
import { connectEventName, ConnectionState } from "./container";

export interface IConnectionStateHandler {
    protocolHandler: () => ProtocolOpHandler | undefined,
    logConnectionStateChangeTelemetry:
        (value: ConnectionState, oldState: ConnectionState, reason?: string | undefined) => void,
    propagateConnectionState: () => void,
    isContainerLoaded: () => boolean,
    shouldClientJoinWrite: () => boolean,
    maxClientLeaveWaitTime: number | undefined,
}

export interface ILocalSequencedClient extends ISequencedClient {
    shouldHaveLeft?: boolean;
}

/**
 * Events emitted by the ConnectionStateHandler.
 */
 export interface IConnectionStateHandlerEvents extends IEvent {
    /**
     * @param opsBehind - number of ops this client is behind (if present).
     */
    (event: "connect", listener: (opsBehind?: number) => void);
}

export class ConnectionStateHandler extends EventEmitterWithErrorHandling<IConnectionStateHandlerEvents> {
    private _connectionState = ConnectionState.Disconnected;
    private _pendingClientId: string | undefined;
    private _clientId: string | undefined;
    private readonly prevClientLeftTimer: Timer;
    // True if we received the leave. False if timed out. Undefined when
    // starting the timer.
    private leaveReceivedResult: boolean | undefined;
    private waitEvent: PerformanceEvent | undefined;
    private _clientSentOps: boolean = false;
    private clientConnectionMode: ConnectionMode | undefined;

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
        super();
        this.prevClientLeftTimer = new Timer(
            // Default is 90 sec for which we are going to wait for its own "leave" message.
            this.handler.maxClientLeaveWaitTime ?? 90000,
            () => {
                this.leaveReceivedResult = false;
                this.applyForConnectedState("timeout");
            },
        );
    }

    // This is true when this client submitted any ops.
    public clientSentOps(connectionMode: ConnectionMode) {
        assert(this._connectionState === ConnectionState.Connected,
            0x1d7 /* "Ops could only be sent when connected" */);
        this._clientSentOps = true;
        this.clientConnectionMode = connectionMode;
    }

    public receivedAddMemberEvent(clientId: string) {
        // This is the only one that requires the pending client ID
        if (clientId === this.pendingClientId) {
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

    private applyForConnectedState(source: "removeMemberEvent" | "addMemberEvent" | "timeout") {
        const protocolHandler = this.handler.protocolHandler();
        // Move to connected state only if we are in Connecting state, we have seen our join op
        // and there is no timer running which means we are not waiting for previous client to leave
        // or timeout has occured while doing so.
        if (this.pendingClientId !== this.clientId
            && this.pendingClientId !== undefined
            && protocolHandler !== undefined && protocolHandler.quorum.getMember(this.pendingClientId) !== undefined
            && !this.prevClientLeftTimer.hasTimer
        ) {
            this.waitEvent?.end({ leaveReceived: this.leaveReceivedResult, source });
            this.setConnectionState(ConnectionState.Connected);
        } else {
            // Adding this event temporarily so that we can get help debugging if something goes wrong.
            this.logger.sendTelemetryEvent({
                eventName: "connectedStateRejected",
                source,
                pendingClientId: this.pendingClientId,
                clientId: this.clientId,
                hasTimer: this.prevClientLeftTimer.hasTimer,
                inQuorum: protocolHandler !== undefined && this.pendingClientId !== undefined
                    && protocolHandler.quorum.getMember(this.pendingClientId) !== undefined,
            });
        }
    }

    public receivedRemoveMemberEvent(clientId: string) {
        // If the client which has left was us, then finish the timer.
        if (this.clientId === clientId) {
            this.prevClientLeftTimer.clear();
            this.leaveReceivedResult = true;
            this.applyForConnectedState("removeMemberEvent");
        }
    }

    public receivedDisconnectEvent(reason: string) {
        this.setConnectionState(ConnectionState.Disconnected, reason);
    }

    public receivedConnectEvent(
        connectionMode: ConnectionMode,
        details: IConnectionDetails,
        opsBehind?: number,
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

        this.emit(connectEventName, opsBehind);

        // Report telemetry after we set client id!
        this.handler.logConnectionStateChangeTelemetry(ConnectionState.Connecting, oldState);

        const protocolHandler = this.handler.protocolHandler();
        // Check if we already processed our own join op through delta storage!
        // we are fetching ops from storage in parallel to connecting to ordering service
        // Given async processes, it's possible that we have already processed our own join message before
        // connection was fully established.
        // Note that we might be still initializing quorum - connection is established proactively on load!
        if ((protocolHandler !== undefined && protocolHandler.quorum.getMember(details.clientId) !== undefined)
            || connectionMode === "read"
        ) {
            this.setConnectionState(ConnectionState.Connected);
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
        if (value === ConnectionState.Connected) {
            assert(oldState === ConnectionState.Connecting,
                0x1d8 /* "Should only transition from Connecting state" */);
            // Mark our old client should have left in the quorum if it's still there
            if (this._clientId !== undefined) {
                const client: ILocalSequencedClient | undefined =
                    this.handler.protocolHandler()?.quorum.getMember(this._clientId);
                if (client !== undefined) {
                    client.shouldHaveLeft = true;
                }
            }
            this._clientId = this.pendingClientId;
            // Set _clientSentOps to false as this is a fresh connection.
            this._clientSentOps = false;
        } else if (value === ConnectionState.Disconnected) {
            // Important as we process our own joinSession message through delta request
            this._pendingClientId = undefined;
            // Only wait for "leave" message if we have some outstanding ops and the client was write client as
            // server would not accept ops from read client. Also check if the timer is not already running as we
            // could receive "Disconnected" event multiple times without getting connected and in that case we
            // don't want to reset the timer as we still want to wait on original client which started this timer.
            // We also check the dirty state of this connection as we only want to wait for the client leave of the
            // client which created the ops. This helps with situation where a client disconnects immediately after
            // getting connected without sending any ops(from previous client). In this case, we would join as write
            // because there would be a diff between client seq number and clientSeqNumberObserved but then we don't
            // want to wait for newly disconnected client to leave as it has not sent any ops yet.
            if (this.handler.shouldClientJoinWrite()
                && this.clientConnectionMode === "write"
                && this.prevClientLeftTimer.hasTimer === false
                && this._clientSentOps
            ) {
                this.leaveReceivedResult = undefined;
                this.prevClientLeftTimer.restart();
            } else {
                // Adding this event temporarily so that we can get help debugging if something goes wrong.
                this.logger.sendTelemetryEvent({
                    eventName: "noWaitOnDisconnected",
                    clientConnectionMode: this.clientConnectionMode,
                    hasTimer: this.prevClientLeftTimer.hasTimer,
                    clientSentOps: this._clientSentOps,
                    shouldClientJoinWrite: this.handler.shouldClientJoinWrite(),
                });
            }
        }

        if (this.handler.isContainerLoaded()) {
            this.handler.propagateConnectionState();
        }

        // Report telemetry after we set client id!
        this.handler.logConnectionStateChangeTelemetry(this._connectionState, oldState, reason);
    }
}

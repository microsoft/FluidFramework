/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IEvent, ITelemetryLogger } from "@fluidframework/common-definitions";
import { IConnectionDetails } from "@fluidframework/container-definitions";
import { ProtocolOpHandler, Quorum } from "@fluidframework/protocol-base";
import { ConnectionMode, IClient, ISequencedClient } from "@fluidframework/protocol-definitions";
import { EventEmitterWithErrorHandling, PerformanceEvent } from "@fluidframework/telemetry-utils";
import { Deferred } from "@fluidframework/common-utils";
import { connectEventName, ConnectionState } from "./container";

export interface IConnectionStateHandler {
    protocolHandler: () => ProtocolOpHandler | undefined,
    logConnectionStateChangeTelemetry:
        (value: ConnectionState, oldState: ConnectionState, reason?: string | undefined) => void,
    propagateConnectionState: () => void,
    isContainerLoaded: () => boolean,
    client: () => IClient,
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
    private prevClientLeftP: Deferred<boolean> | undefined;
    private isDirty: boolean| undefined;

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
    }

    public setDirtyState() {
        this.isDirty = true;
    }

    public receivedAddMemberEvent(clientId: string, quorum: Quorum) {
        // This is the only one that requires the pending client ID
        if (clientId === this.pendingClientId) {
            // Wait for previous client to leave the quorum before firing "connected" event.
            if (this.prevClientLeftP) {
                const event = PerformanceEvent.start(this.logger, {
                    eventName: "WaitBeforeClientLeave",
                    waitOnClientId: this._clientId,
                    hadOutstandingOps: this.handler.shouldClientJoinWrite(),
                });
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.prevClientLeftP.promise.then((leaveReceived: boolean) => {
                    const props = {
                        leaveReceived,
                        waitingClientChanged: this.pendingClientId === undefined || clientId !== this.pendingClientId,
                    };
                    // Move to connected state only if we are still waiting on right client. It may happen that
                    // during wait, the client again got Disconnected/Connecting and pending client Id changed,
                    // so then we don't want to move to connected state here.
                    if (clientId === this.pendingClientId) {
                        event.end(props);
                        this.setConnectionState(ConnectionState.Connected);
                    } else {
                        // Cancel the event here as we don't want to record multiple successful events.
                        event.cancel(props);
                    }
                });
            } else {
                this.setConnectionState(ConnectionState.Connected);
            }
        }
    }

    public receivedRemoveMemberEvent(clientId: string) {
        // If the client which has left was us, then resolve the def. promise.
        if (this.clientId === clientId) {
            this.prevClientLeftP?.resolve(true);
            // Set it to undefined as the desired client has left and we don't want to wait for it anymore.
            this.prevClientLeftP = undefined;
        }
    }

    public receivedDisconnectEvent(reason: string) {
        this.setConnectionState(ConnectionState.Disconnected, reason);
    }

    public receivedConnectEvent(
        emitter: EventEmitter,
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
        if ((protocolHandler !== undefined && protocolHandler.quorum.has(details.clientId))
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
            // Mark our old client should have left in the quorum if it's still there
            if (this._clientId !== undefined) {
                const client: ILocalSequencedClient | undefined =
                    this.handler.protocolHandler()?.quorum.getMember(this._clientId);
                if (client !== undefined) {
                    client.shouldHaveLeft = true;
                }
            }
            this._clientId = this.pendingClientId;
            // Set isDirty to false as this is a fresh connection.
            this.isDirty = false;
        } else if (value === ConnectionState.Disconnected) {
            // Important as we process our own joinSession message through delta request
            this._pendingClientId = undefined;
            // Only wait for "leave" message if we have some outstanding ops and the client was write client as
            // server would not accept ops from read client. Also check if the promise is not already set as we
            // could receive "Disconnected" event multiple times without getting connected and in that case we
            // don't want to reset the promise as we still want to wait on original client which created this promise.
            // We also check the dirty state of this connection as we only want to wait for the client leave of the
            // client which created the ops. This helps with situation where a client disconnects immediately after
            // getting connected without sending any ops. In that case, we would join as write because there would be
            // a diff between client seq number and clientSeqNumberObserved but then we don't want to wait for newly
            // disconnected client to leave as it has not sent any ops yet.
            if (this.handler.shouldClientJoinWrite()
                && this.handler.client().mode === "write"
                && this.prevClientLeftP === undefined
                && this.isDirty
            ) {
                this.prevClientLeftP = new Deferred();
                // Default is 90 sec for which we are going to wait for its own "leave" message.
                setTimeout(() => {
                    this.prevClientLeftP?.resolve(false);
                    this.prevClientLeftP = undefined;
                }, this.handler.maxClientLeaveWaitTime ?? 90000);
            }
        }

        if (this.handler.isContainerLoaded()) {
            this.handler.propagateConnectionState();
        }

        // Report telemetry after we set client id!
        this.handler.logConnectionStateChangeTelemetry(this._connectionState, oldState, reason);
    }
}

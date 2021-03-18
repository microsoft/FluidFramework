/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IEvent, ITelemetryLogger } from "@fluidframework/common-definitions";
import { IConnectionDetails } from "@fluidframework/container-definitions";
import { ProtocolOpHandler, Quorum } from "@fluidframework/protocol-base";
import { ConnectionMode, ISequencedClient } from "@fluidframework/protocol-definitions";
import { EventEmitterWithErrorHandling } from "@fluidframework/telemetry-utils";
import { connectEventName, ConnectionState } from "./container";

export interface IConnectionStateHandler {
    protocolHandler: () => ProtocolOpHandler | undefined,
    logConnectionStateChangeTelemetry:
        (value: ConnectionState, oldState: ConnectionState, reason?: string | undefined) => void,
    propagateConnectionState: () => void,
    isContainerLoaded: () => boolean,
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

    public receivedAddMemberEvent(clientId: string, quorum: Quorum) {
        // This is the only one that requires the pending client ID
        if (clientId === this.pendingClientId) {
            this.setConnectionState(ConnectionState.Connected);
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
        } else if (value === ConnectionState.Disconnected) {
            // Important as we process our own joinSession message through delta request
            this._pendingClientId = undefined;
        }

        if (this.handler.isContainerLoaded()) {
            this.handler.propagateConnectionState();
        }

        // Report telemetry after we set client id!
        this.handler.logConnectionStateChangeTelemetry(this._connectionState, oldState, reason);
    }
}

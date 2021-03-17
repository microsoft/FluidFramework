/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { IConnectionDetails } from "@fluidframework/container-definitions";
import { ProtocolOpHandler, Quorum } from "@fluidframework/protocol-base";
import { ConnectionMode } from "@fluidframework/protocol-definitions";
import { connectEventName, ConnectionState, ILocalSequencedClient } from "./container";

export class ConnectionStateHandler {
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
        private readonly protocolHandler: () => ProtocolOpHandler | undefined,
        private readonly logConnectionStateChangeTelemetry:
            (value: ConnectionState, oldState: ConnectionState, reason?: string | undefined) => void,
        private readonly propagateConnectionState: () => void,
        private readonly isContainerLoaded: () => boolean,
        private readonly logger: ITelemetryLogger,
    ) {
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

        emitter.emit(connectEventName, opsBehind);

        // Report telemetry after we set client id!
        this.logConnectionStateChangeTelemetry(ConnectionState.Connecting, oldState);

        const protocolHandler = this.protocolHandler();
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
    private setConnectionState(value: ConnectionState.Connecting | ConnectionState.Connected);
    private setConnectionState(
        value: ConnectionState,
        reason?: string,
    ) {
        assert(value !== ConnectionState.Connecting, "Trying to set connection state while container is connecting!");
        if (this.connectionState === value) {
            // Already in the desired state - exit early
            this.logger.sendErrorEvent({ eventName: "setConnectionStateSame", value });
            return;
        }

        const oldState = this._connectionState;
        this._connectionState = ConnectionState.Disconnected;

        if (value === ConnectionState.Connected) {
            // Mark our old client should have left in the quorum if it's still there
            if (this._clientId !== undefined) {
                const client: ILocalSequencedClient | undefined =
                    this.protocolHandler()?.quorum.getMember(this._clientId);
                if (client !== undefined) {
                    client.shouldHaveLeft = true;
                }
            }
            this._clientId = this.pendingClientId;
        } else if (value === ConnectionState.Disconnected) {
            // Important as we process our own joinSession message through delta request
            this._pendingClientId = undefined;
        }

        if (this.isContainerLoaded()) {
            this.propagateConnectionState();
        }

        // Report telemetry after we set client id!
        this.logConnectionStateChangeTelemetry(this._connectionState, oldState, reason);
    }
}

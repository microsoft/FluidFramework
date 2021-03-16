/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, performance } from "@fluidframework/common-utils";
import { IConnectionDetails } from "@fluidframework/container-definitions";
import { isOnline, OnlineStatus } from "@fluidframework/driver-utils";
import { ProtocolOpHandler } from "@fluidframework/protocol-base";
import { ISequencedClient } from "@fluidframework/protocol-definitions";
import { raiseConnectedEvent, TelemetryLogger } from "@fluidframework/telemetry-utils";
import { Audience } from "./audience";
import { Container } from "./container";
import { ContainerContext } from "./containerContext";
import { DeltaManager, ReconnectMode } from "./deltaManager";

export const connectEventName = "connect";

export enum ConnectionState {
    /**
     * The document is no longer connected to the delta server
     */
    Disconnected,

    /**
     * The document has an inbound connection but is still pending for outbound deltas
     */
    Connecting,

    /**
     * The document is fully connected
     */
    Connected,
}

interface ILocalSequencedClient extends ISequencedClient {
    shouldHaveLeft?: boolean;
}

export class ConnectionStateHandler {
    private firstConnection = true;
    private _manualReconnectInProgress = false;
    private _messageCountAfterDisconnection: number = 0;
    private _connectionState = ConnectionState.Disconnected;
    private pendingClientId: string | undefined;
    private _clientId: string | undefined;
    private readonly _connectionTransitionTimes: number[] = [];

    private get protocolHandler(): ProtocolOpHandler | undefined {
        try {
            return this.protocolHandlerGetter();
        } catch (error) {}
    }

    private get context() {
        return this.containerContextGetter();
    }

    public get connectionState(): ConnectionState {
        return this._connectionState;
    }

    public get connected(): boolean {
        return this.connectionState === ConnectionState.Connected;
    }

    public get clientId(): string | undefined {
        return this._clientId;
    }

    public get messageCountAfterDisconnection() {
        return this._messageCountAfterDisconnection;
    }

    public set messageCountAfterDisconnection(value) {
        this._messageCountAfterDisconnection = value;
    }

    public get connectionTransitionTimes() {
        return this._connectionTransitionTimes;
    }

    public get manualReconnectInProgress() {
        return this._manualReconnectInProgress;
    }

    public set manualReconnectInProgress(value: boolean) {
        this._manualReconnectInProgress = value;
    }

    constructor(
        private readonly container: Container,
        private readonly deltaManager: DeltaManager,
        private readonly audience: Audience,
        private readonly logger: ITelemetryLogger,
        private readonly containerContextGetter: () => ContainerContext,
        private readonly protocolHandlerGetter: () => ProtocolOpHandler | undefined,
    ) {
        this.deltaManager.on(connectEventName, (details: IConnectionDetails, opsBehind?: number) => {
            const oldState = this._connectionState;
            this._connectionState = ConnectionState.Connecting;

            // Stash the clientID to detect when transitioning from connecting (socket.io channel open) to connected
            // (have received the join message for the client ID)
            // This is especially important in the reconnect case. It's possible there could be outstanding
            // ops sent by this client, so we should keep the old client id until we see our own client's
            // join message. after we see the join message for out new connection with our new client id,
            // we know there can no longer be outstanding ops that we sent with the previous client id.
            this.pendingClientId = details.clientId;

            container.emit(connectEventName, opsBehind);

            // Report telemetry after we set client id!
            this.logConnectionStateChangeTelemetry(ConnectionState.Connecting, oldState);

            // Check if we already processed our own join op through delta storage!
            // we are fetching ops from storage in parallel to connecting to ordering service
            // Given async processes, it's possible that we have already processed our own join message before
            // connection was fully established.
            // Note that we might be still initializing quorum - connection is established proactively on load!
            if ((this.protocolHandler !== undefined && this.protocolHandler.quorum.has(details.clientId))
                    || this.deltaManager.connectionMode === "read") {
                this.setConnectionState(ConnectionState.Connected);
            }

            // Back-compat for new client and old server.
            this.audience.clear();

            for (const priorClient of details.initialClients ?? []) {
                this.audience.addMember(priorClient.clientId, priorClient.client);
            }
        });

        this.deltaManager.on("disconnect", (reason: string) => {
            this.manualReconnectInProgress = false;
            this.setConnectionState(ConnectionState.Disconnected, reason);
        });
    }

    public setProtocolMemberEvents(protocol: ProtocolOpHandler) {
        // Track membership changes and update connection state accordingly
        protocol.quorum.on("addMember", (clientId, details) => {
            // This is the only one that requires the pending client ID
            if (clientId === this.pendingClientId) {
                this.setConnectionState(ConnectionState.Connected);
            }
        });
    }

    private logConnectionStateChangeTelemetry(
        value: ConnectionState,
        oldState: ConnectionState,
        reason?: string,
    ) {
        // Log actual event
        const time = performance.now();
        this.connectionTransitionTimes[value] = time;
        const duration = time - this.connectionTransitionTimes[oldState];

        let durationFromDisconnected: number | undefined;
        let connectionMode: string | undefined;
        let connectionInitiationReason: string | undefined;
        let autoReconnect: ReconnectMode | undefined;
        let checkpointSequenceNumber: number | undefined;
        let sequenceNumber: number | undefined;
        let opsBehind: number | undefined;
        if (value === ConnectionState.Disconnected) {
            autoReconnect = this.deltaManager.reconnectMode;
        } else {
            connectionMode = this.deltaManager.connectionMode;
            sequenceNumber = this.deltaManager.lastSequenceNumber;
            if (value === ConnectionState.Connected) {
                durationFromDisconnected = time - this.connectionTransitionTimes[ConnectionState.Disconnected];
                durationFromDisconnected = TelemetryLogger.formatTick(durationFromDisconnected);
            } else {
                // This info is of most interest on establishing connection only.
                checkpointSequenceNumber = this.deltaManager.lastKnownSeqNumber;
                if (this.deltaManager.hasCheckpointSequenceNumber) {
                    opsBehind = checkpointSequenceNumber - sequenceNumber;
                }
            }
            if (this.firstConnection) {
                connectionInitiationReason = "InitialConnect";
            } else if (this.manualReconnectInProgress) {
                connectionInitiationReason = "ManualReconnect";
            } else {
                connectionInitiationReason = "AutoReconnect";
            }
        }

        this.logger.sendPerformanceEvent({
            eventName: `ConnectionStateChange_${ConnectionState[value]}`,
            from: ConnectionState[oldState],
            duration,
            durationFromDisconnected,
            reason,
            connectionInitiationReason,
            socketDocumentId: this.deltaManager.socketDocumentId,
            pendingClientId: this.pendingClientId,
            clientId: this.clientId,
            connectionMode,
            autoReconnect,
            opsBehind,
            online: OnlineStatus[isOnline()],
            lastVisible: this.container.lastVisible !== undefined ?
                performance.now() - this.container.lastVisible : undefined,
            checkpointSequenceNumber,
            sequenceNumber,
        });

        if (value === ConnectionState.Connected) {
            this.firstConnection = false;
            this.manualReconnectInProgress = false;
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
        this._connectionState = value;

        if (value === ConnectionState.Connected) {
            // Mark our old client should have left in the quorum if it's still there
            if (this._clientId !== undefined) {
                const client: ILocalSequencedClient | undefined =
                    this.protocolHandler?.quorum.getMember(this._clientId);
                if (client !== undefined) {
                    client.shouldHaveLeft = true;
                }
            }
            this._clientId = this.pendingClientId;
        } else if (value === ConnectionState.Disconnected) {
            // Important as we process our own joinSession message through delta request
            this.pendingClientId = undefined;
        }

        if (this.container.isLoaded) {
            this.propagateConnectionState();
        }

        // Report telemetry after we set client id!
        this.logConnectionStateChangeTelemetry(value, oldState, reason);
    }

    public propagateConnectionState() {
        const logOpsOnReconnect: boolean =
            this._connectionState === ConnectionState.Connected &&
            !this.firstConnection &&
            this.deltaManager.connectionMode === "write";
        if (logOpsOnReconnect) {
            this._messageCountAfterDisconnection = 0;
        }

        const state = this._connectionState === ConnectionState.Connected;
        if (!this.context.disposed) {
            this.context.setConnectionState(state, this.clientId);
        }
        assert(this.protocolHandler !== undefined, "Protocol handler should be set here");
        this.protocolHandler.quorum.setConnectionState(state, this.clientId);
        raiseConnectedEvent(this.logger, this.container, state, this.clientId);

        if (logOpsOnReconnect) {
            this.logger.sendTelemetryEvent(
                { eventName: "OpsSentOnReconnect", count: this._messageCountAfterDisconnection });
        }
    }
}

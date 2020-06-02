/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IDocumentDeltaConnection } from "@microsoft/fluid-driver-definitions";
import {
    ConnectionMode,
    IConnected,
    IContentMessage,
    IDocumentMessage,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalClient,
    ISignalMessage,
    ITokenClaims,
    ScopeType,
} from "@microsoft/fluid-protocol-definitions";
import { debug } from "./debug";
import { FileDeltaStorageService } from "./fileDeltaStorageService";

const MaxBatchDeltas = 2000;

// Since the replay service never actually sends messages the size below is arbitrary
const ReplayMaxMessageSize = 16 * 1024;

const fileProtocolVersion = "^0.1.0";

const replayDocumentId = "replayDocId";

const Claims: ITokenClaims = {
    documentId: replayDocumentId,
    scopes: [ScopeType.DocWrite],
    tenantId: "",
    user: {
        id: "",
    },
};

/**
 * Replay service used to play ops using the delta connection.
 */
export class Replayer {
    private currentReplayOp = 0;

    constructor(
        private readonly deltaConnection: ReplayFileDeltaConnection,
        private readonly documentStorageService: FileDeltaStorageService) {
    }

    public get currentReplayedOp() {
        return this.currentReplayOp;
    }

    public set currentReplayedOp(op: number) {
        this.currentReplayOp = op;
    }

    /**
     * Replay the ops upto a certain number.
     * @param replayTo - The last op number to be replayed.
     */
    public replay(replayTo: number) {
        let totalReplayedOps = 0;
        let done: boolean;
        do {
            const fetchToBatch = this.currentReplayOp + MaxBatchDeltas;
            const fetchTo = Math.min(fetchToBatch, replayTo);

            const fetchedOps = this.documentStorageService.getFromWebSocket(this.currentReplayOp, fetchTo);

            if (fetchedOps.length <= 0) {
                break;
            } else {
                this.emit(fetchedOps);
                totalReplayedOps += fetchedOps.length;
                this.currentReplayOp += fetchedOps.length;
                done = this.isDoneFetch(replayTo);
            }
        } while (!done);
        return totalReplayedOps;
    }

    private isDoneFetch(replayTo: number) {
        if (replayTo >= 0) {
            return this.currentReplayOp >= replayTo;
        }
        return false;
    }

    private emit(ops: ISequencedDocumentMessage[]) {
        // Note: do not clone messages here!
        // If Replay Tool fails due to one container patching message in-place,
        // then same thing can happen in shipping product due to
        // socket reuse in ODSP between main and summarizer containers.
        this.deltaConnection.emit("op", replayDocumentId, ops);
    }
}

export class ReplayFileDeltaConnection extends EventEmitter implements IDocumentDeltaConnection {
    /**
     * Mimic the delta connection to replay ops on it.
     *
     * @param documentDeltaStorageService - The delta storage service to get ops from.
     * @returns Document delta connection.
     */
    public static async create(
        documentDeltaStorageService: FileDeltaStorageService): Promise<ReplayFileDeltaConnection> {
        const mode: ConnectionMode = "write";
        const connection = {
            claims: Claims,
            clientId: "",
            existing: true,
            initialContents: [],
            initialMessages: [],
            initialSignals: [],
            initialClients: [],
            maxMessageSize: ReplayMaxMessageSize,
            mode,
            parentBranch: null,
            serviceConfiguration: {
                blockSize: 64436,
                maxMessageSize:  16 * 1024,
                summary: {
                    idleTime: 5000,
                    maxOps: 1000,
                    maxTime: 5000 * 12,
                    maxAckWaitTime: 600000,
                },
            },
            supportedVersions: [fileProtocolVersion],
            user: null,
            version: fileProtocolVersion,
        };
        const deltaConnection = new ReplayFileDeltaConnection(connection, documentDeltaStorageService);
        return deltaConnection;
    }

    public readonly maxMessageSize = ReplayMaxMessageSize;
    private readonly replayer: Replayer;

    public constructor(public details: IConnected, documentDeltaStorageService: FileDeltaStorageService) {
        super();
        this.replayer = new Replayer(
            this,
            documentDeltaStorageService);
    }

    public getReplayer() {
        return this.replayer;
    }

    public get clientId(): string {
        return this.details.clientId;
    }

    public get mode(): ConnectionMode {
        return this.details.mode;
    }

    public get claims(): ITokenClaims {
        return this.details.claims;
    }

    public get existing(): boolean {
        return this.details.existing;
    }

    public get parentBranch(): string | null {
        return this.details.parentBranch;
    }

    public get version(): string {
        return this.details.version;
    }

    public get initialContents(): IContentMessage[] | undefined {
        return this.details.initialContents;
    }

    public get initialMessages(): ISequencedDocumentMessage[] | undefined {
        return this.details.initialMessages;
    }

    public get initialSignals(): ISignalMessage[] | undefined {
        return this.details.initialSignals;
    }

    public get initialClients(): ISignalClient[] {
        return this.details.initialClients ? this.details.initialClients : [];
    }

    public get serviceConfiguration(): IServiceConfiguration {
        return this.details.serviceConfiguration;
    }

    public submit(documentMessages: IDocumentMessage[]): void {
        debug("dropping the outbound message");
    }

    public async submitAsync(documentMessages: IDocumentMessage[]): Promise<void> {
        debug("dropping the outbound message and wait for response");
    }

    public async submitSignal(message: any) {
        debug("dropping the outbound signal and wait for response");
    }

    public disconnect() {
        debug("no implementation for disconnect...");
    }
}

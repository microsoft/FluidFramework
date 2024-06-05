/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IDisposable } from "@fluidframework/core-interfaces";
import {
	ConnectionMode,
	ISequencedDocumentMessage,
	ISignalMessage,
} from "@fluidframework/driver-definitions";
import {
	IDocumentDeltaConnection,
	IDocumentDeltaConnectionEvents,
	IClientConfiguration,
	IConnected,
	IDocumentMessage,
	ISignalClient,
	ITokenClaims,
	ScopeType,
} from "@fluidframework/driver-definitions/internal";

import { FileDeltaStorageService } from "./fileDeltaStorageService.js";

const MaxBatchDeltas = 2000;

// Since the replay service never actually sends messages the size below is arbitrary
const ReplayMaxMessageSize = 16 * 1024;

const fileProtocolVersion = "^0.1.0";

const replayDocumentId = "replayDocId";

const Claims: ITokenClaims = {
	documentId: replayDocumentId,
	scopes: [ScopeType.DocRead],
	tenantId: "",
	user: {
		id: "",
	},
	iat: Math.round(new Date().getTime() / 1000),
	exp: Math.round(new Date().getTime() / 1000) + 60 * 60, // 1 hour expiration
	ver: "1.0",
};

/**
 * Replay service used to play ops using the delta connection.
 * @internal
 */
export class Replayer {
	private currentReplayOp = 0;

	constructor(
		private readonly deltaConnection: ReplayFileDeltaConnection,
		private readonly documentStorageService: FileDeltaStorageService,
	) {}

	public get currentReplayedOp() {
		return this.currentReplayOp;
	}

	public set currentReplayedOp(op: number) {
		this.currentReplayOp = op;
	}

	public get ops(): readonly Readonly<ISequencedDocumentMessage>[] {
		return this.documentStorageService.ops;
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

			const fetchedOps = this.documentStorageService.getFromWebSocket(
				this.currentReplayOp,
				fetchTo,
			);

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

/**
 * @internal
 */
export class ReplayFileDeltaConnection
	extends TypedEventEmitter<IDocumentDeltaConnectionEvents>
	implements IDocumentDeltaConnection, IDisposable
{
	/**
	 * Mimic the delta connection to replay ops on it.
	 *
	 * @param documentDeltaStorageService - The delta storage service to get ops from.
	 * @returns Document delta connection.
	 */
	public static async create(
		documentDeltaStorageService: FileDeltaStorageService,
	): Promise<ReplayFileDeltaConnection> {
		const mode: ConnectionMode = "read";
		const connection = {
			claims: Claims,
			clientId: "PseudoClientId",
			existing: true,
			initialMessages: [],
			initialSignals: [],
			initialClients: [],
			maxMessageSize: ReplayMaxMessageSize,
			mode,
			serviceConfiguration: {
				blockSize: 64436,
				maxMessageSize: ReplayMaxMessageSize,
			},
			supportedVersions: [fileProtocolVersion],
			user: null,
			version: fileProtocolVersion,
		};
		const deltaConnection = new ReplayFileDeltaConnection(
			connection,
			documentDeltaStorageService,
		);
		return deltaConnection;
	}

	public readonly maxMessageSize = ReplayMaxMessageSize;
	private readonly replayer: Replayer;

	public constructor(
		public details: IConnected,
		documentDeltaStorageService: FileDeltaStorageService,
	) {
		super();
		this.replayer = new Replayer(this, documentDeltaStorageService);
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

	public get version(): string {
		return this.details.version;
	}

	public get initialMessages(): ISequencedDocumentMessage[] {
		return this.details.initialMessages;
	}

	public get initialSignals(): ISignalMessage[] {
		return this.details.initialSignals;
	}

	public get initialClients(): ISignalClient[] {
		return this.details.initialClients;
	}

	public get serviceConfiguration(): IClientConfiguration {
		return this.details.serviceConfiguration;
	}

	public submit(documentMessages: IDocumentMessage[]): void {
		// ReplayFileDeltaConnection.submit() can't be called - client never sees its own join on,
		// and thus can never move to sending ops.
		throw new Error("ReplayFileDeltaConnection.submit() can't be called");
	}

	public async submitSignal(message: any) {}

	private _disposed = false;
	public get disposed() {
		return this._disposed;
	}
	public dispose() {
		this._disposed = true;
	}
}

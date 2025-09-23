/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IDisposable, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import {
	ScopeType,
	type ConnectionMode,
	type IClient,
	type IClientConfiguration,
	type ICreateBlobResponse,
	type IDocumentDeltaConnection,
	type IDocumentDeltaConnectionEvents,
	type IDocumentDeltaStorageService,
	type IDocumentMessage,
	type IDocumentService,
	type IDocumentServiceEvents,
	type IDocumentServiceFactory,
	type IDocumentServicePolicies,
	type IDocumentStorageService,
	type IDocumentStorageServicePolicies,
	type IResolvedUrl,
	type ISequencedDocumentMessage,
	type ISignalClient,
	type ISignalMessage,
	type ISnapshotTree,
	type IStream,
	type ISummaryTree,
	type ITokenClaims,
	type IVersion,
} from "@fluidframework/driver-definitions/internal";

import type { IConnectionStateChangeReason } from "./contracts.js";

export class FrozenDocumentServiceFactory implements IDocumentServiceFactory {
	async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
		return new FrozenDocumentService(resolvedUrl);
	}
	async createContainer(): Promise<IDocumentService> {
		throw new Error("Method not implemented.");
	}
}

class FrozenDocumentService
	extends TypedEventEmitter<IDocumentServiceEvents>
	implements IDocumentService
{
	constructor(public readonly resolvedUrl: IResolvedUrl) {
		super();
	}

	public readonly policies: IDocumentServicePolicies = {
		storageOnly: true,
	};
	async connectToStorage(): Promise<IDocumentStorageService> {
		return new FrozenDocumentStorageService();
	}
	async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		return new FrozenDocumentDeltaStorageService();
	}
	async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
		return new FrozenDeltaStream();
	}
	dispose(): void {}
}

class FrozenDocumentStorageService implements IDocumentStorageService {
	policies?: IDocumentStorageServicePolicies | undefined;
	async getSnapshotTree(
		// eslint-disable-next-line @rushstack/no-new-null
	): Promise<ISnapshotTree | null> {
		throw new Error("Method not implemented.");
	}
	async getVersions(): Promise<IVersion[]> {
		throw new Error("Method not implemented.");
	}
	async createBlob(): Promise<ICreateBlobResponse> {
		throw new Error("Method not implemented.");
	}
	async readBlob(): Promise<ArrayBufferLike> {
		throw new Error("Method not implemented.");
	}
	async uploadSummaryWithContext(): Promise<string> {
		throw new Error("Method not implemented.");
	}
	async downloadSummary(): Promise<ISummaryTree> {
		throw new Error("Method not implemented.");
	}
}

class FrozenDocumentDeltaStorageService implements IDocumentDeltaStorageService {
	fetchMessages(): IStream<ISequencedDocumentMessage[]> {
		return {
			read: async () => ({
				done: true,
			}),
		};
	}
}

/**
 * Implementation of IDocumentDeltaConnection that does not support submitting
 * or receiving ops. Used in storage-only mode.
 */
const clientFrozenDeltaStream: IClient = {
	mode: "read",
	details: { capabilities: { interactive: true } },
	permission: [],
	user: { id: "storage-only client" }, // we need some "fake" ID here.
	scopes: [],
};
const clientIdFrozenDeltaStream: string = "storage-only client";

export class FrozenDeltaStream
	extends TypedEventEmitter<IDocumentDeltaConnectionEvents>
	implements IDocumentDeltaConnection, IDisposable
{
	clientId = clientIdFrozenDeltaStream;
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	claims = {
		scopes: [ScopeType.DocRead],
	} as ITokenClaims;
	mode: ConnectionMode = "read";
	existing: boolean = true;
	maxMessageSize: number = 0;
	version: string = "";
	initialMessages: ISequencedDocumentMessage[] = [];
	initialSignals: ISignalMessage[] = [];
	initialClients: ISignalClient[] = [
		{ client: clientFrozenDeltaStream, clientId: clientIdFrozenDeltaStream },
	];
	serviceConfiguration: IClientConfiguration = {
		maxMessageSize: 0,
		blockSize: 0,
	};
	checkpointSequenceNumber?: number | undefined = undefined;
	/**
	 * Connection which is not connected to socket.
	 * @param storageOnlyReason - Reason on why the connection to delta stream is not allowed.
	 * @param readonlyConnectionReason - reason/error if any which lead to using FrozenDeltaStream.
	 */
	constructor(
		public readonly storageOnlyReason?: string,
		public readonly readonlyConnectionReason?: IConnectionStateChangeReason,
	) {
		super();
	}
	submit(messages: IDocumentMessage[]): void {
		this.emit(
			"nack",
			this.clientId,
			messages.map((operation) => {
				return {
					operation,
					content: { message: "Cannot submit with storage-only connection", code: 403 },
				};
			}),
		);
	}
	submitSignal(message: unknown): void {
		this.emit("nack", this.clientId, {
			operation: message,
			content: { message: "Cannot submit signal with storage-only connection", code: 403 },
		});
	}

	private _disposed = false;
	public get disposed(): boolean {
		return this._disposed;
	}
	public dispose(): void {
		this._disposed = true;
	}
}

export function isFrozenDeltaStreamConnection(
	connection: unknown,
): connection is FrozenDeltaStream {
	return connection instanceof FrozenDeltaStream;
}

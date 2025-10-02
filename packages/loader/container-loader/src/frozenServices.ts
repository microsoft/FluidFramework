/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IDisposable } from "@fluidframework/core-interfaces";
import {
	ScopeType,
	type ConnectionMode,
	type IClient,
	type IClientConfiguration,
	type IDocumentDeltaConnection,
	type IDocumentDeltaConnectionEvents,
	type IDocumentDeltaStorageService,
	type IDocumentMessage,
	type IDocumentService,
	type IDocumentServiceEvents,
	type IDocumentServiceFactory,
	type IDocumentServicePolicies,
	type IDocumentStorageService,
	type IResolvedUrl,
	type ISequencedDocumentMessage,
	type ISignalClient,
	type ISignalMessage,
	type ITokenClaims,
} from "@fluidframework/driver-definitions/internal";

import type { IConnectionStateChangeReason } from "./contracts.js";

export class FrozenDocumentServiceFactory implements IDocumentServiceFactory {
	constructor(private readonly documentServiceFactory?: IDocumentServiceFactory) {}

	async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
		return new FrozenDocumentService(
			resolvedUrl,
			await this.documentServiceFactory?.createDocumentService(resolvedUrl),
		);
	}
	async createContainer(): Promise<IDocumentService> {
		throw new Error("The FrozenDocumentServiceFactory cannot be used to create containers.");
	}
}

class FrozenDocumentService
	extends TypedEventEmitter<IDocumentServiceEvents>
	implements IDocumentService
{
	constructor(
		public readonly resolvedUrl: IResolvedUrl,
		private readonly documentService?: IDocumentService,
	) {
		super();
	}

	public readonly policies: IDocumentServicePolicies = {
		storageOnly: true,
	};
	async connectToStorage(): Promise<IDocumentStorageService> {
		return new FrozenDocumentStorageService(await this.documentService?.connectToStorage());
	}
	async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		return frozenDocumentDeltaStorageService;
	}
	async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
		return new FrozenDeltaStream();
	}
	dispose(): void {}
}

const frozenDocumentStorageServiceHandler = (): never => {
	throw new Error("Operations are not supported on the FrozenDocumentStorageService.");
};
class FrozenDocumentStorageService implements IDocumentStorageService {
	constructor(private readonly documentStorageService?: IDocumentStorageService) {}

	getSnapshotTree = frozenDocumentStorageServiceHandler;
	getSnapshot = frozenDocumentStorageServiceHandler;
	getVersions = frozenDocumentStorageServiceHandler;
	createBlob = frozenDocumentStorageServiceHandler;
	readBlob =
		this.documentStorageService?.readBlob.bind(this.documentStorageService) ??
		frozenDocumentStorageServiceHandler;
	uploadSummaryWithContext = frozenDocumentStorageServiceHandler;
	downloadSummary = frozenDocumentStorageServiceHandler;
}

const frozenDocumentDeltaStorageService: IDocumentDeltaStorageService = {
	fetchMessages: () => ({
		read: async () => ({
			done: true,
		}),
	}),
};

const clientFrozenDeltaStream: IClient = {
	mode: "read",
	details: { capabilities: { interactive: true } },
	permission: [],
	user: { id: "storage-only client" }, // we need some "fake" ID here.
	scopes: [],
};
const clientIdFrozenDeltaStream: string = "storage-only client";

/**
 * Implementation of IDocumentDeltaConnection that does not support submitting
 * or receiving ops. Used in storage-only mode and in frozen loads.
 */
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

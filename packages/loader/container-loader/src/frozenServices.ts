/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IDisposable } from "@fluidframework/core-interfaces";
import { isPromiseLike } from "@fluidframework/core-utils/internal";
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

/**
 * Creates an {@link IDocumentServiceFactory} that produces a "frozen" document service: one whose
 * delta stream never sends or receives ops, and whose storage service only supports
 * {@link IDocumentStorageService.readBlob}. Used to load a container from pending local state
 * without re-establishing a live connection.
 *
 * @param factory - The underlying factory to wrap. Its storage backs blob reads; all other
 * storage operations throw. May be omitted when blob fetches are not required.
 * @param readOnly - When `true` (the default), the document service advertises the
 * {@link IDocumentServicePolicies.storageOnly} policy, which causes the loader to surface the
 * container as read-only (see `IContainer.readOnlyInfo`).
 *
 * When `false`, the container is loaded as writable so the runtime will accept DDS submissions.
 * The first such submission triggers the connectionManager's read→write upgrade attempt. Since
 * there is no real upstream and we will not fabricate a quorum join op, that upgrade hangs and
 * the container settles into a `Disconnected` state. Local DDS state continues to update via
 * optimistic apply, and submitted ops accumulate in the runtime's pending-state manager — which
 * is exactly the state needed to capture pending local state. Use `false` when callers want to
 * accrue and capture pending state without publishing it.
 * @returns A factory that produces frozen document services.
 * @legacy @alpha
 */
export function createFrozenDocumentServiceFactory(
	factory?: IDocumentServiceFactory | Promise<IDocumentServiceFactory>,
	readOnly: boolean = true,
): IDocumentServiceFactory {
	return factory instanceof FrozenDocumentServiceFactory
		? factory
		: new FrozenDocumentServiceFactory(readOnly, factory);
}

export class FrozenDocumentServiceFactory implements IDocumentServiceFactory {
	constructor(
		private readonly readOnly: boolean,
		private readonly documentServiceFactory?:
			| IDocumentServiceFactory
			| Promise<IDocumentServiceFactory>,
	) {}

	async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
		let factory = this.documentServiceFactory;
		if (isPromiseLike(factory)) {
			factory = await this.documentServiceFactory;
		}
		return new FrozenDocumentService(
			resolvedUrl,
			this.readOnly,
			await factory?.createDocumentService(resolvedUrl),
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
	private disposed = false;
	private readonly pendingConnectRejecters = new Set<(reason: Error) => void>();

	constructor(
		public readonly resolvedUrl: IResolvedUrl,
		private readonly readOnly: boolean,
		private readonly documentService?: IDocumentService,
	) {
		super();
		// When readOnly, advertise the storageOnly policy. The connectionManager short-circuits
		// on it: it synthesizes a FrozenDeltaStream itself and never calls
		// connectToDeltaStream, and the readOnlyInfo getter forces the container to read-only
		// because the live connection is a FrozenDeltaStream.
		this.policies = readOnly ? { storageOnly: true } : {};
	}

	public readonly policies: IDocumentServicePolicies;
	async connectToStorage(): Promise<IDocumentStorageService> {
		return new FrozenDocumentStorageService(await this.documentService?.connectToStorage());
	}
	async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		return frozenDocumentDeltaStorageService;
	}
	async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
		if (this.readOnly) {
			// connectionManager short-circuits via policies.storageOnly before reaching here in
			// the read-only path; this is a defensive fallback.
			return new FrozenDeltaStream();
		}
		if (client.mode !== "write") {
			// Initial / read-mode connect: hand the runtime a writable-surface FrozenDeltaStream
			// (DocWrite scope + not matched by isFrozenDeltaStreamConnection, so readOnlyInfo
			// reports `readonly: false` and the runtime will accept DDS submissions).
			return new FrozenDeltaStream({ readOnly: false });
		}
		// Write upgrade: triggered the moment the runtime tries to send (sendMessages sees
		// connectionMode === "read"). We can't honor it — there's no upstream and we won't
		// fabricate a quorum join op. Hang the promise. The container settles into Disconnected
		// (Connected → reconnecting → never resolves), DDS local apply continues to work, and
		// submitted ops accumulate in the runtime's pendingStateManager (the outbox sees
		// shouldSend() return false and skips actual send). That's the right representation
		// for "load to accrue and capture pending state without publishing".
		return new Promise<IDocumentDeltaConnection>((_, reject) => {
			if (this.disposed) {
				reject(new Error("FrozenDocumentService disposed"));
				return;
			}
			this.pendingConnectRejecters.add(reject);
		});
	}
	dispose(): void {
		this.disposed = true;
		// Unblock any hung connect attempts so connectCore can exit cleanly. Without this,
		// container.dispose() leaves the connectionManager's connect loop awaiting a promise
		// that never resolves until garbage collection cleans up the closure.
		const rejecters = [...this.pendingConnectRejecters];
		this.pendingConnectRejecters.clear();
		for (const reject of rejecters) {
			reject(new Error("FrozenDocumentService disposed"));
		}
	}
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
 * Inert {@link IDocumentDeltaConnection} for frozen container loads. Has no server upstream:
 * op and signal streams are empty, and `initialClients` contains only its own synthetic
 * read-only client — which lets the connection state handler observe "self" in the audience
 * and transition the container to Connected without waiting for a real join op or signal.
 *
 * Two variants, selected via `options.readOnly` (default `true`):
 *
 * - **Read-only (default)** — claims show only `DocRead`. Used by storage-only loads (where connectionManager synthesizes one directly via `policies.storageOnly`) and by the forbidden / out-of-storage fallback paths. {@link isFrozenDeltaStreamConnection} matches this variant and drives the read-only forcing in `ConnectionManager.readOnlyInfo`.
 * - **Writable (`{ readOnly: false }`)** — claims include `DocWrite` so the container surfaces as writable; not matched by `isFrozenDeltaStreamConnection`, so `readOnlyInfo` reports `readonly: false`. Connection mode stays `"read"`: advertising `"write"` would imply quorum membership, which we cannot honor. The connectionManager's read→write upgrade attempt that follows the first runtime submit is intercepted in `FrozenDocumentService.connectToDeltaStream` and hung indefinitely; the container then settles into Disconnected.
 *
 * Both variants nack any incoming submit or submitSignal: this connection has no upstream and
 * `ConnectionManager.sendMessages` short-circuits read-mode ops to reconnect rather than calling
 * `submit`, so under normal flow neither method should ever fire. A nack reaching the
 * connectionManager surfaces the misuse — and may close the container — which is the right
 * defensive signal that something has bypassed the expected flow.
 */
export class FrozenDeltaStream
	extends TypedEventEmitter<IDocumentDeltaConnectionEvents>
	implements IDocumentDeltaConnection, IDisposable
{
	public readonly clientId: string = clientIdFrozenDeltaStream;
	public readonly claims: ITokenClaims;
	public readonly mode: ConnectionMode = "read";
	public readonly existing: boolean = true;
	public readonly maxMessageSize: number = 0;
	public readonly version: string = "";
	public readonly initialMessages: ISequencedDocumentMessage[] = [];
	public readonly initialSignals: ISignalMessage[] = [];
	public readonly initialClients: ISignalClient[] = [
		{ client: clientFrozenDeltaStream, clientId: clientIdFrozenDeltaStream },
	];
	public readonly serviceConfiguration: IClientConfiguration = {
		maxMessageSize: 0,
		blockSize: 0,
	};
	public readonly checkpointSequenceNumber?: number | undefined = undefined;

	public readonly readOnly: boolean;
	public readonly storageOnlyReason: string | undefined;
	public readonly readonlyConnectionReason: IConnectionStateChangeReason | undefined;

	/**
	 * @param options - Configuration:
	 *
	 * - `readOnly`: when `true` (the default), claims include only `DocRead` and {@link isFrozenDeltaStreamConnection} matches this instance (forcing the container read-only). When `false`, claims include `DocWrite` and the container surfaces as writable.
	 * - `storageOnlyReason`: surfaced via `IContainer.readOnlyInfo.storageOnlyReason` for the read-only variant.
	 * - `readonlyConnectionReason`: error/reason that led to using this stream as a fallback (e.g. forbidden delta stream connection); surfaced via the same readOnlyInfo path.
	 */
	constructor(options?: {
		readOnly?: boolean;
		storageOnlyReason?: string;
		readonlyConnectionReason?: IConnectionStateChangeReason;
	}) {
		super();
		this.readOnly = options?.readOnly ?? true;
		this.storageOnlyReason = options?.storageOnlyReason;
		this.readonlyConnectionReason = options?.readonlyConnectionReason;
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		this.claims = {
			scopes: this.readOnly
				? [ScopeType.DocRead]
				: [ScopeType.DocRead, ScopeType.DocWrite],
		} as ITokenClaims;
	}

	submit(messages: IDocumentMessage[]): void {
		// Defensive nack: nothing should send on a frozen delta stream. If this fires, an
		// invariant in connectionManager has changed and we want it to surface loudly.
		this.emit(
			"nack",
			this.clientId,
			messages.map((operation) => ({
				operation,
				content: { message: "Cannot submit on a frozen delta stream", code: 403 },
			})),
		);
	}

	submitSignal(message: unknown): void {
		this.emit("nack", this.clientId, {
			operation: message,
			content: { message: "Cannot submit signal on a frozen delta stream", code: 403 },
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

/**
 * Recognizes the read-only variant of {@link FrozenDeltaStream}. Drives the storage-only forcing
 * in `ConnectionManager.readOnlyInfo`: only the read-only variant should make the container
 * surface as read-only.
 */
export function isFrozenDeltaStreamConnection(
	connection: unknown,
): connection is FrozenDeltaStream {
	return connection instanceof FrozenDeltaStream && connection.readOnly;
}

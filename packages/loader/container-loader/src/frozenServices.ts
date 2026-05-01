/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IDisposable } from "@fluidframework/core-interfaces";
import { assert, isPromiseLike } from "@fluidframework/core-utils/internal";
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
 * Creates an `IDocumentServiceFactory` that produces a "frozen" document service: one whose
 * delta stream never sends or receives ops, and whose storage service only supports
 * `IDocumentStorageService.readBlob`. Used to load a container from pending local state
 * without re-establishing a live connection.
 *
 * @param factory - The underlying factory to wrap. Its storage backs blob reads; all other
 * storage operations throw. May be omitted when blob fetches are not required.
 * @param readOnly - When `true` (the default), the document service advertises the
 * `IDocumentServicePolicies.storageOnly` policy, which causes the loader to surface the
 * container as read-only (see `IContainer.readOnlyInfo`).
 *
 * When `false`, the container is loaded as writable so the runtime will accept DDS submissions.
 * The connection itself stays `Connected`: `ConnectionManager.sendMessages` recognizes the
 * `FrozenDeltaStream` as the live connection and short-circuits — the message is dropped at
 * the network layer rather than triggering a read→write reconnect. Local DDS state continues
 * to update via optimistic apply, and submitted ops accumulate in the runtime's pending-state
 * manager, which is exactly the state needed to capture pending local state. Use `false` when
 * callers want to accrue and capture pending state without publishing it.
 * @returns A factory that produces frozen document services.
 * @legacy @alpha
 */
export function createFrozenDocumentServiceFactory(
	factory?: IDocumentServiceFactory | Promise<IDocumentServiceFactory>,
	readOnly: boolean = true,
): IDocumentServiceFactory {
	if (factory instanceof FrozenDocumentServiceFactory) {
		// Already wrapped. Reuse if readOnly matches; otherwise unwrap and rewrap so the caller's
		// most recent readOnly intent wins (silently honoring caller intent rather than dropping
		// the new argument).
		return factory.readOnly === readOnly
			? factory
			: new FrozenDocumentServiceFactory(readOnly, factory.inner);
	}
	return new FrozenDocumentServiceFactory(readOnly, factory);
}

export class FrozenDocumentServiceFactory implements IDocumentServiceFactory {
	constructor(
		public readonly readOnly: boolean,
		public readonly inner?: IDocumentServiceFactory | Promise<IDocumentServiceFactory>,
	) {}

	async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
		const factory = isPromiseLike(this.inner) ? await this.inner : this.inner;
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
	private handedOutInitialConnection = false;
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
		// First connect: hand out the writable-surface FrozenDeltaStream regardless of
		// `client.mode`. The mode may be forced to "write" by Container.connectToDeltaStream
		// when allowReconnect is false or the client is non-interactive; that's fine because
		// the connection object itself reports mode="read" and the runtime-driven write
		// upgrade is suppressed at sendMessages (see ConnectionManager.sendMessages's
		// FrozenDeltaStream short-circuit). DocWrite scope + not matched by
		// isFrozenDeltaStreamConnection, so readOnlyInfo reports `readonly: false`.
		if (!this.handedOutInitialConnection) {
			this.handedOutInitialConnection = true;
			return new FrozenDeltaStream({ readOnly: false });
		}
		if (client.mode !== "write") {
			// Subsequent connect in read mode (e.g. reconnect after a forced disconnect). Hand
			// out another writable stream so the container can re-establish.
			return new FrozenDeltaStream({ readOnly: false });
		}
		// Subsequent connect in write mode. Defense-in-depth: under normal flow this is
		// unreachable because sendMessages short-circuits FrozenDeltaStream submissions before
		// they can trigger a write reconnect, and a nack on the FrozenDeltaStream itself is
		// the only other path that drives reconnectOnError("write"). If we get here anyway,
		// hang the promise — there's no upstream and we won't fabricate a quorum join op.
		//
		// Lifecycle: container.dispose() reaches us via service.dispose() and rejects the
		// promise so connectionManager's connect loop exits cleanly. container.close() (without
		// dispose()) does not propagate to service.dispose() — the hung promise stays pending
		// until GC. That's a benign leak: the closure retains references to FrozenDocumentService
		// and the rejecter, and is collected with the rest of the container graph.
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
 * Inert `IDocumentDeltaConnection` for frozen container loads. Has no server upstream:
 * op and signal streams are empty, and `initialClients` contains only its own synthetic
 * read-only client — which lets the connection state handler observe "self" in the audience
 * and transition the container to Connected without waiting for a real join op or signal.
 *
 * Two variants, selected via `options.readOnly` (default `true`):
 *
 * - **Read-only (default)** — claims show only `DocRead`. Used by storage-only loads (where connectionManager synthesizes one directly via `policies.storageOnly`) and by the forbidden / out-of-storage fallback paths. {@link isFrozenDeltaStreamConnection} matches this variant and drives the read-only forcing in `ConnectionManager.readOnlyInfo`.
 * - **Writable (`{ readOnly: false }`)** — claims include `DocWrite` so the container surfaces as writable; not matched by `isFrozenDeltaStreamConnection`, so `readOnlyInfo` reports `readonly: false`. Connection mode stays `"read"`: advertising `"write"` would imply quorum membership, which we cannot honor. `ConnectionManager.sendMessages` recognizes any `FrozenDeltaStream` and short-circuits before its read-mode upgrade branch — the message is dropped at the network layer instead of triggering a reconnect, so the container stays `Connected` and submitted ops accumulate in the runtime's `pendingStateManager`.
 *
 * Both variants nack any incoming `submit`: this connection has no upstream and
 * `ConnectionManager.sendMessages` recognizes `FrozenDeltaStream` and drops messages before
 * they reach `submit`, so under normal flow it should never fire. A nack reaching the
 * connectionManager surfaces the misuse — and may close the container — which is the right
 * defensive signal that something has bypassed the expected flow.
 *
 * `submitSignal` is a silent no-op for both variants. Signals are ephemeral and best-effort —
 * runtime/presence subsystems may submit them at any point in the writable-frozen lifetime, and
 * dropping them is the correct behavior here (we have no upstream). Closing the container or
 * triggering a reconnect on a stray signal would be strictly worse than dropping it.
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
	 * - `storageOnlyReason`: surfaced via `IContainer.readOnlyInfo.storageOnlyReason` for the read-only variant. Must not be passed when `readOnly: false` (the writable variant has no readOnlyInfo to surface it on).
	 * - `readonlyConnectionReason`: error/reason that led to using this stream as a fallback (e.g. forbidden delta stream connection); surfaced via the same readOnlyInfo path. Same constraint as `storageOnlyReason`.
	 */
	constructor(options?: {
		readOnly?: boolean;
		storageOnlyReason?: string;
		readonlyConnectionReason?: IConnectionStateChangeReason;
	}) {
		super();
		this.readOnly = options?.readOnly ?? true;
		// Both fields are surfaced through the read-only-forcing path in
		// ConnectionManager.readOnlyInfo, which only triggers for the read-only variant.
		// Passing them on the writable variant is silently dropped today; assert to make the
		// misuse loud rather than surprising.
		assert(
			this.readOnly || options?.storageOnlyReason === undefined,
			"storageOnlyReason is only meaningful for the read-only frozen delta stream variant",
		);
		assert(
			this.readOnly || options?.readonlyConnectionReason === undefined,
			"readonlyConnectionReason is only meaningful for the read-only frozen delta stream variant",
		);
		this.storageOnlyReason = options?.storageOnlyReason;
		this.readonlyConnectionReason = options?.readonlyConnectionReason;
		// Cast: ITokenClaims requires tenantId/documentId/user/iat/exp/ver, but a frozen
		// delta stream has no tenant or session to draw real values from — it's a synthetic
		// in-process connection that never reaches a service. Inventing sentinel values
		// would imply quorum membership we cannot honor; only `scopes` actually drives
		// behavior here (DocRead vs DocWrite gates readOnlyInfo). The cast is the honest
		// representation of "this connection has no claims worth populating."
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		this.claims = {
			scopes: this.readOnly ? [ScopeType.DocRead] : [ScopeType.DocRead, ScopeType.DocWrite],
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

	submitSignal(_message: unknown): void {
		// Intentional no-op. See class JSDoc for rationale.
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

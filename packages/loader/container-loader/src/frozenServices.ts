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
import { v4 as uuid } from "uuid";

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
 * `WritableFrozenDeltaStream` as the live connection and short-circuits — the message is dropped
 * at the network layer rather than triggering a read→write reconnect. Local DDS state continues
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
	private readonly storageServices = new Set<FrozenDocumentStorageService>();

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
		//
		// Audit (2026-05-05): the only consumer of `policies.storageOnly` as a frozen-container
		// signal is `ConnectionManager` (synthesizing a `FrozenDeltaStream` when set). All other
		// matches in the loader/runtime/driver layers are either drivers reading their own
		// policies (e.g. local-driver) or `IReadOnlyInfo.storageOnly`, which is derived from the
		// live connection — not the policy. So the writable-frozen container is intentionally
		// indistinguishable from a normal container at the policies layer; downstream behavior
		// flows through the live `WritableFrozenDeltaStream` instead.
		this.policies = readOnly ? { storageOnly: true } : {};
	}

	public readonly policies: IDocumentServicePolicies;
	async connectToStorage(): Promise<IDocumentStorageService> {
		const storage = new FrozenDocumentStorageService(
			this.readOnly,
			await this.documentService?.connectToStorage(),
		);
		this.storageServices.add(storage);
		return storage;
	}
	async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		return frozenDocumentDeltaStorageService;
	}
	async connectToDeltaStream(_client: IClient): Promise<IDocumentDeltaConnection> {
		if (this.readOnly) {
			// connectionManager short-circuits via policies.storageOnly before reaching here
			// in the read-only path; reaching this branch indicates a non-connectionManager
			// consumer or a regression of the short-circuit. Throw to surface the misuse
			// rather than silently produce a working stream.
			throw new Error(
				"FrozenDocumentService is read-only; connectToDeltaStream should not be called (connectionManager short-circuits via policies.storageOnly)",
			);
		}
		// Writable path: hand out a fresh WritableFrozenDeltaStream regardless of client.mode
		// or whether this is the initial connect or a reconnect. The stream's own mode is
		// "read" (advertising "write" would imply quorum membership we cannot honor), and
		// `ConnectionManager.sendMessages` short-circuits on WritableFrozenDeltaStream so
		// outbound writes never reach a real network. The per-instance clientId minted in
		// FrozenDeltaStreamBase prevents pendingStateManager 0x173 on replay across reconnects.
		return new WritableFrozenDeltaStream();
	}
	dispose(_error?: unknown): void {
		// Cascade disposal to each storage instance so any hanging `createBlob` promises (the
		// writable-frozen pending-blob mechanism) reject and the BlobManager can release its
		// references. Without this, hung promises remain held by BlobManager closures for the
		// lifetime of the process.
		for (const storage of this.storageServices) {
			storage.dispose();
		}
		this.storageServices.clear();
	}
}

const frozenDocumentStorageServiceHandler = (): never => {
	throw new Error("Operations are not supported on the FrozenDocumentStorageService.");
};

class FrozenDocumentStorageService implements IDocumentStorageService, IDisposable {
	// Single deferred shared by every in-flight `createBlob` call. The writable-frozen
	// `createBlob` returns this promise so the BlobManager keeps the blob in `uploading`
	// state (see comment in the constructor). Rejecting the deferred on disposal fans the
	// rejection out to every awaiter at once — and to any future `createBlob` calls too,
	// since they receive the already-rejected promise.
	private readonly disposalDeferred: {
		readonly promise: Promise<never>;
		readonly reject: (error: Error) => void;
	};

	private _disposed = false;
	public get disposed(): boolean {
		return this._disposed;
	}

	constructor(
		readOnly: boolean,
		private readonly documentStorageService?: IDocumentStorageService,
	) {
		let rejectFn!: (error: Error) => void;
		const promise = new Promise<never>((_, reject) => {
			rejectFn = reject;
		});
		// Attach a no-op catch so node doesn't log an unhandled-rejection warning when
		// dispose runs before any caller has awaited the promise. Callers awaiting the
		// original promise still observe the rejection.
		promise.catch(() => {});
		this.disposalDeferred = { promise, reject: rejectFn };

		// In the writable-frozen path, `createBlob` returns a never-resolving promise instead
		// of throwing. This keeps the BlobManager's `localBlobCache` entry in the `uploading`
		// state: `getPendingBlobs` downgrades `uploading` blobs to `localOnly` in pending
		// state, so the blob survives `getPendingLocalState`. A subsequent live load runs
		// `sharePendingBlobs`, which re-enters `uploadAndAttach` against the real storage to
		// complete the upload. Throwing here would instead delete the cache entry (in
		// `uploadAndAttach`'s catch handler) and lose the blob — defeating the whole point of
		// accruing pending state.
		this.createBlob = readOnly
			? frozenDocumentStorageServiceHandler
			: async () => this.disposalDeferred.promise;
	}

	getSnapshotTree = frozenDocumentStorageServiceHandler;
	getSnapshot = frozenDocumentStorageServiceHandler;
	getVersions = frozenDocumentStorageServiceHandler;
	createBlob: IDocumentStorageService["createBlob"];
	readBlob =
		this.documentStorageService?.readBlob.bind(this.documentStorageService) ??
		frozenDocumentStorageServiceHandler;
	uploadSummaryWithContext = frozenDocumentStorageServiceHandler;
	downloadSummary = frozenDocumentStorageServiceHandler;

	public dispose(error?: Error): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this.disposalDeferred.reject(
			error ?? new Error("FrozenDocumentStorageService is disposed"),
		);
	}
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

// Cast rationale: ITokenClaims requires tenantId/documentId/user/iat/exp/ver, but a frozen
// delta stream has no tenant or session to draw real values from — it's a synthetic
// in-process connection that never reaches a service. Inventing sentinel values would imply
// quorum membership we cannot honor; only `scopes` actually drives behavior here (DocRead vs
// DocWrite gates readOnlyInfo). The cast is the honest representation of "this connection
// has no claims worth populating."
/* eslint-disable @typescript-eslint/consistent-type-assertions */
const readOnlyClaims: ITokenClaims = { scopes: [ScopeType.DocRead] } as ITokenClaims;
const writableClaims: ITokenClaims = {
	scopes: [ScopeType.DocRead, ScopeType.DocWrite],
} as ITokenClaims;
/* eslint-enable @typescript-eslint/consistent-type-assertions */

/**
 * Inert `IDocumentDeltaConnection` for frozen container loads. Has no server upstream:
 * op and signal streams are empty, and `initialClients` contains only its own synthetic
 * read-only client — which lets the connection state handler observe "self" in the audience
 * and transition the container to Connected without waiting for a real join op or signal.
 *
 * Two concrete variants share this base — see their JSDoc for variant-specific details:
 *
 * - {@link FrozenDeltaStream} — read-only.
 * - {@link WritableFrozenDeltaStream} — writable.
 *
 * Both variants nack any incoming `submit`: this connection has no upstream and
 * `ConnectionManager.sendMessages` recognizes `WritableFrozenDeltaStream` and drops messages
 * before they reach `submit`, so under normal flow it should never fire. A nack reaching the
 * connectionManager surfaces the misuse — and may close the container — which is the right
 * defensive signal that something has bypassed the expected flow.
 *
 * `submitSignal` is a silent no-op for both variants. Signals are ephemeral and best-effort —
 * runtime/presence subsystems may submit them at any point in the writable-frozen lifetime, and
 * dropping them is the correct behavior here (we have no upstream). Closing the container or
 * triggering a reconnect on a stray signal would be strictly worse than dropping it.
 */
abstract class FrozenDeltaStreamBase
	extends TypedEventEmitter<IDocumentDeltaConnectionEvents>
	implements IDocumentDeltaConnection, IDisposable
{
	public readonly clientId: string;
	public readonly claims: ITokenClaims;
	public readonly initialClients: ISignalClient[];
	public readonly mode: ConnectionMode = "read";
	public readonly existing: boolean = true;
	public readonly maxMessageSize: number = 0;
	public readonly version: string = "";
	public readonly initialMessages: ISequencedDocumentMessage[] = [];
	public readonly initialSignals: ISignalMessage[] = [];
	public readonly serviceConfiguration: IClientConfiguration = {
		maxMessageSize: 0,
		blockSize: 0,
	};
	public readonly checkpointSequenceNumber?: number | undefined = undefined;

	constructor(clientId: string, claims: ITokenClaims) {
		super();
		this.clientId = clientId;
		this.claims = claims;
		// initialClients mirrors clientId so the audience handler observes "self" and
		// transitions the container to Connected without waiting for a real join op or signal.
		this.initialClients = [{ client: clientFrozenDeltaStream, clientId }];
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
 * Read-only variant of {@link FrozenDeltaStreamBase}. Claims show only `DocRead`. Used by
 * storage-only loads (where `connectionManager` synthesizes one directly via
 * `policies.storageOnly`) and by the forbidden / out-of-storage fallback paths.
 * {@link isFrozenDeltaStreamConnection} matches this variant and drives the read-only forcing
 * in `ConnectionManager.readOnlyInfo`. Uses the historical `"storage-only client"` constant
 * `clientId`, preserving existing behavior for any consumer that keys off it.
 *
 * `storageOnlyReason` and `readonlyConnectionReason` are surfaced through `IContainer.readOnlyInfo`
 * for diagnostics on the fallback paths (`isDeltaStreamConnectionForbiddenError`,
 * `outOfStorageError`).
 */
export class FrozenDeltaStream extends FrozenDeltaStreamBase {
	public readonly storageOnlyReason: string | undefined;
	public readonly readonlyConnectionReason: IConnectionStateChangeReason | undefined;

	constructor(options?: {
		storageOnlyReason?: string;
		readonlyConnectionReason?: IConnectionStateChangeReason;
	}) {
		// Constant clientId: preserves the pre-PR `"storage-only client"` identity for any
		// consumer that keys off it. The 0x173 replay-assert risk that motivates per-instance
		// clientIds applies only to the writable variant, where the runtime accumulates dirty
		// pending ops across reconnects; the read-only variant does not.
		super(clientIdFrozenDeltaStream, readOnlyClaims);
		this.storageOnlyReason = options?.storageOnlyReason;
		this.readonlyConnectionReason = options?.readonlyConnectionReason;
	}
}

/**
 * Variant of {@link FrozenDeltaStreamBase} that appears to support writing but remains
 * "frozen" — no messages are actually sent or received. The stream itself does not enforce
 * the no-send guarantee; that lives in `ConnectionManager.sendMessages`, which recognizes
 * any `WritableFrozenDeltaStream` (via {@link isWritableFrozenDeltaStreamConnection}) and
 * short-circuits before its read-mode upgrade branch. Submitted ops are dropped at the
 * connection-manager layer, so the container stays `Connected` and the runtime accumulates
 * them in `pendingStateManager`.
 *
 * "Appears writable" mechanics: claims include `DocWrite` so the container surfaces as
 * writable; not matched by {@link isFrozenDeltaStreamConnection}, so `readOnlyInfo` reports
 * `readonly: false`. Connection mode stays `"read"` (advertising `"write"` would imply quorum
 * membership we cannot honor).
 *
 * Each instance mints a fresh `frozen-delta-stream/<uuid>` `clientId` to avoid
 * `pendingStateManager` `0x173` (`replayPendingStates called twice for same clientId!`) on
 * reconnect with dirty pending ops. Sibling (not subclass) of `FrozenDeltaStream` so
 * `instanceof` cleanly distinguishes the two for `ConnectionManager`'s short-circuits.
 */
export class WritableFrozenDeltaStream extends FrozenDeltaStreamBase {
	constructor() {
		super(`frozen-delta-stream/${uuid()}`, writableClaims);
	}
}

/**
 * Recognizes the read-only variant of {@link FrozenDeltaStreamBase}. Drives the storage-only
 * forcing in `ConnectionManager.readOnlyInfo`: only the read-only variant should make the
 * container surface as read-only. {@link WritableFrozenDeltaStream} is a sibling class, not
 * a subclass, so `instanceof FrozenDeltaStream` already excludes it.
 */
export function isFrozenDeltaStreamConnection(
	connection: unknown,
): connection is FrozenDeltaStream {
	return connection instanceof FrozenDeltaStream;
}

/**
 * Recognizes the writable variant of {@link FrozenDeltaStreamBase}. Drives the
 * `ConnectionManager.sendMessages` short-circuit: writable-frozen submits must be dropped at
 * the network layer instead of triggering a read→write reconnect. Sibling (not subclass) of
 * {@link FrozenDeltaStream}, so `instanceof WritableFrozenDeltaStream` excludes the read-only
 * variant.
 */
export function isWritableFrozenDeltaStreamConnection(
	connection: unknown,
): connection is WritableFrozenDeltaStream {
	return connection instanceof WritableFrozenDeltaStream;
}

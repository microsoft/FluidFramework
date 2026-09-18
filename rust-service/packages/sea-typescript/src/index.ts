/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type * as Generated from "../generated/memory-compression/web/sea_wasm.js";

/** Immutable content identity, not availability evidence or a WASM-owned object.
 * @internal
 */
export interface SeaTreeId {
	/** Content kind. */
	readonly kind: "blob" | "directory";
	/** Fixed-size content digest. */
	readonly bytes: Uint8Array;
}

/** Explicit author membership and decorator configuration.
 * @internal
 */
export interface SeaSessionOptions {
	/** Stable submission author. */
	readonly author: Uint8Array;
	/** Fresh membership identity. */
	readonly session: Uint8Array;
	/** Latest incorporated event. */
	readonly reference?: bigint;
	/** Enables compression only when the loaded bundle supports it. */
	readonly compression?: boolean;
}

/** One named child of an immutable directory.
 * @internal
 */
export interface SeaDirectoryEntry {
	/** Child name. */
	readonly name: string;
	/** Serializable child identity. */
	readonly child: SeaTreeId;
}

/** Selected or published snapshot.
 * @internal
 */
export interface SeaSnapshot {
	/** Snapshot result discriminant. */
	readonly kind: "snapshot";
	/** Included committed event. */
	readonly atEvent: bigint;
	/** Immutable snapshot root. */
	readonly root: SeaTreeId;
}

/** One committed opaque event.
 * @internal
 */
export interface SeaEvent {
	/** Event result discriminant. */
	readonly kind: "event";
	/** Committed archive position. */
	readonly position: bigint;
	/** Decoded application payload. */
	readonly payload: Uint8Array;
	/** Referenced content, if present. */
	readonly blobTree?: SeaTreeId;
	/** Stable author identity. */
	readonly author: Uint8Array;
	/** Membership identity. */
	readonly session: Uint8Array;
	/** Stable submission identity. */
	readonly operation: Uint8Array;
	/** Latest event incorporated by this author. */
	readonly reference?: bigint;
	/** Minimum reference observed by the sequencer. */
	readonly minimumReference?: bigint;
}

/** Monitored history progress, separate from application events.
 * @internal
 */
export interface SeaProgress {
	/** Progress result discriminant. */
	readonly kind: "progress";
	/** Last delivered position. */
	readonly previous?: bigint;
	/** Latest known position. */
	readonly latestKnown?: bigint;
	/** Current delivery state. */
	readonly status: "StreamingBacklog" | "AwaitingNewItems" | "FallenBehind";
}

/** Closed history/load result cases.
 * @internal
 */
export type SeaLoadResult = SeaSnapshot | SeaEvent | SeaProgress;

/** Latest snapshot and optional publisher authority.
 * @internal
 */
export interface SeaSnapshotCoordination {
	/** Latest publication position. */
	readonly latest?: bigint;
	/** Current Sea-selected publisher fence. */
	readonly fence?: bigint;
}

/** Cancellation-owned stream; concurrent reads are rejected.
 * @internal
 */
export interface SeaStream<Item> {
	/** Reads one item or returns undefined at completion. */
	next(): Promise<Item | undefined>;
	/** Cancels pending reads and releases owned resources. */
	cancel(): void;
}

/** Non-Fluid-specific session operations with explicit membership lifetime.
 * @internal
 */
export interface SeaSession {
	/** Backend-assigned identity for reopening on the same service. */
	readonly document: Uint8Array;
	/** Uploads a blob through the selected stack. */
	putBlob(payload: Uint8Array): Promise<SeaTreeId>;
	/** Fetches and decodes a blob. */
	getBlob(id: SeaTreeId): Promise<Uint8Array>;
	/** Publishes a complete immutable directory. */
	putDirectory(entries: readonly SeaDirectoryEntry[]): Promise<SeaTreeId>;
	/** Reads named children of a directory. */
	getDirectory(id: SeaTreeId): Promise<readonly SeaDirectoryEntry[]>;
	/** Submits an opaque event without implicit retry. */
	submit(
		operation: Uint8Array,
		reference: bigint | undefined,
		payload: Uint8Array,
	): Promise<bigint>;
	/** Resolves a submission without resubmitting it. */
	resolveSubmission(operation: Uint8Array): Promise<bigint | undefined>;
	/** Reads bounded or live monitored history. */
	read(after?: bigint, stopAfter?: bigint): SeaStream<SeaLoadResult>;
	/** Loads a snapshot and its gap-free suffix. */
	load(required?: bigint): Promise<SeaStream<SeaLoadResult>>;
	/** Registers explicit snapshot participation. */
	coordinateSnapshots(
		participation: "readOnly" | "seaSelected" | "clientSelected",
	): Promise<SeaStream<SeaSnapshotCoordination>>;
	/** Resolves dependencies and conditionally publishes a snapshot. */
	publishSnapshot(
		parent: bigint | undefined,
		fence: bigint | undefined,
		position: bigint,
		root: SeaTreeId,
	): Promise<SeaSnapshot>;
	/** Closes this membership, leaving other sessions and shared service storage intact. */
	close(): Promise<void>;
}

/** Independent memory namespace, shared only through this explicit object.
 * @internal
 */
export interface SeaMemoryService {
	/** Creates a document when its identity is undefined, otherwise opens it. */
	open(document: Uint8Array | undefined, options: SeaSessionOptions): Promise<SeaSession>;
	/** Releases service ownership; existing sessions retain their own resources. */
	close(): void;
}

/** Build artifact selection, independent of per-session compression settings.
 * @internal
 */
export interface SeaMemoryBundleOptions {
	/** Selects compiled capabilities without enabling decorators implicitly. */
	readonly configuration?: "memory" | "memory-compression";
	/** Browser fetch initialization or Node.js filesystem initialization. */
	readonly environment?: "browser" | "node";
}

/** Values needed from one initialized bundle; never exposed to callers. */
type BindingModule = Pick<typeof Generated, "SeaTreeId" | "SeaSessionOptions">;

/** Initialization promises keyed by artifact and environment, not service storage. */
const initialized = new Map<string, Promise<unknown>>();

/** Initializes one generated web module exactly once per artifact. */
function initialize<Module>(
	key: string,
	load: () => Promise<Module>,
	initializeModule: (module: Module) => Promise<unknown>,
): Promise<Module> {
	let promise = initialized.get(key);
	if (promise === undefined) {
		promise = load().then(async (module) => {
			await initializeModule(module);
			return module;
		});
		initialized.set(key, promise);
	}
	return promise as Promise<Module>;
}

/** Creates an independent memory service using a lazily initialized package-owned bundle.
 * @internal
 */
export async function createMemoryService(
	options: SeaMemoryBundleOptions = {},
): Promise<SeaMemoryService> {
	const configuration = options.configuration ?? "memory";
	const node = options.environment === "node";
	const key = `${configuration}/${node ? "node" : "web"}`;
	const bindings = node
		? await initialize(
				key,
				() =>
					configuration === "memory"
						? import("../generated/memory/node/sea_wasm.js")
						: import("../generated/memory-compression/node/sea_wasm.js"),
				async () => {},
			)
		: await initialize(
				key,
				() =>
					configuration === "memory"
						? import("../generated/memory/web/sea_wasm.js")
						: import("../generated/memory-compression/web/sea_wasm.js"),
				(module) => module.default(),
			);
	const service = new bindings.SeaMemoryService();
	let closed = false;
	return {
		async open(document, sessionOptions) {
			if (closed) {
				throw new Error("memory service is closed");
			}
			const generatedOptions = makeOptions(bindings, sessionOptions);
			try {
				return wrapSession(await service.open(document, generatedOptions), bindings);
			} finally {
				generatedOptions.free();
			}
		},
		close() {
			if (!closed) {
				closed = true;
				service.free();
			}
		},
	};
}

/** Endpoint and package-owned capability selection for browser WebTransport.
 * @internal
 */
export interface SeaWebTransportOptions {
	/** Reachable real WebTransport endpoint. */
	readonly url: string;
	/** SHA-256 digest of the development certificate. */
	readonly certificateHash: Uint8Array;
	/** Artifact capability selection, separate from session compression. */
	readonly configuration?: "webtransport" | "webtransport-compression";
}

/** Opens a real browser WebTransport session with no transport fallback.
 * @internal
 */
export async function openWebTransport(
	service: SeaWebTransportOptions,
	document: Uint8Array | undefined,
	options: SeaSessionOptions,
): Promise<SeaSession> {
	const configuration = service.configuration ?? "webtransport";
	const bindings = await initialize(
		`${configuration}/web`,
		() =>
			configuration === "webtransport"
				? import("../generated/webtransport/web/sea_wasm.js")
				: import("../generated/webtransport-compression/web/sea_wasm.js"),
		(module) => module.default(),
	);
	const generatedOptions = makeOptions(bindings, options);
	try {
		return wrapSession(
			await bindings.openWebTransport(
				service.url,
				service.certificateHash,
				document,
				generatedOptions,
			),
			bindings,
		);
	} finally {
		generatedOptions.free();
	}
}

/** Constructs options in the same module that will open their session. */
function makeOptions(
	bindings: BindingModule,
	options: SeaSessionOptions,
): Generated.SeaSessionOptions {
	return new bindings.SeaSessionOptions(
		options.author,
		options.session,
		options.reference,
		options.compression ?? false,
	);
}

/** Copies a generated identity into a plain value and releases its WASM allocation. */
function copyIdentity(id: Generated.SeaTreeId): SeaTreeId {
	try {
		const kind = id.kind;
		if (kind !== "blob" && kind !== "directory") {
			throw new Error("unknown content identity kind");
		}
		return { kind, bytes: id.bytes };
	} finally {
		id.free();
	}
}

/** Constructs a temporary identity inside the session's own module. */
function generatedIdentity(bindings: BindingModule, id: SeaTreeId): Generated.SeaTreeId {
	return id.kind === "blob"
		? bindings.SeaTreeId.blob(id.bytes)
		: bindings.SeaTreeId.directory(id.bytes);
}

/** Copies generated stream identities before returning neutral application data. */
function copyResult(value: unknown): SeaLoadResult {
	const result = value as SeaLoadResult;
	if (result.kind === "snapshot") {
		return { ...result, root: copyIdentity(result.root as Generated.SeaTreeId) };
	}
	if (result.kind === "event" && result.blobTree !== undefined) {
		return { ...result, blobTree: copyIdentity(result.blobTree as Generated.SeaTreeId) };
	}
	return result;
}

/** Preserves cancellation while deferring free until a pending WASM borrow finishes. */
function wrapStream<Item>(
	stream: Generated.SeaEventStream | Generated.SeaSnapshotStream,
	convert: (value: unknown) => Item,
): SeaStream<Item> {
	let reading = false;
	let closed = false;
	let released = false;
	const release = (): void => {
		if (closed && !reading && !released) {
			released = true;
			stream.free();
		}
	};
	return {
		async next() {
			if (closed) {
				return undefined;
			}
			if (reading) {
				throw new Error("stream is already being read");
			}
			reading = true;
			try {
				const result: unknown = await stream.next();
				if (result === undefined) {
					closed = true;
					return undefined;
				}
				return convert(result);
			} finally {
				reading = false;
				release();
			}
		},
		cancel() {
			if (!closed) {
				closed = true;
				stream.cancel();
				release();
			}
		},
	};
}

/** Keeps generated objects inside their owning module and presents neutral session values. */
function wrapSession(session: Generated.SeaSession, bindings: BindingModule): SeaSession {
	let closing: Promise<void> | undefined;
	return {
		document: session.document,
		async putBlob(payload) {
			return copyIdentity(await session.putBlob(payload));
		},
		async getBlob(id) {
			const tree = generatedIdentity(bindings, id);
			try {
				return await session.getBlob(tree);
			} finally {
				tree.free();
			}
		},
		async putDirectory(entries) {
			return copyIdentity(
				await session.putDirectory(
					entries.map((entry) => entry.name),
					entries.map((entry) => generatedIdentity(bindings, entry.child)),
				),
			);
		},
		async getDirectory(id) {
			const tree = generatedIdentity(bindings, id);
			try {
				const entries = (await session.getDirectory(tree)) as {
					name: string;
					child: Generated.SeaTreeId;
				}[];
				return entries.map((entry) => ({
					name: entry.name,
					child: copyIdentity(entry.child),
				}));
			} finally {
				tree.free();
			}
		},
		submit: (operation, reference, payload) => session.submit(operation, reference, payload),
		resolveSubmission: (operation) => session.resolveSubmission(operation),
		read: (after, stopAfter) => wrapStream(session.read(after, stopAfter), copyResult),
		async load(required) {
			return wrapStream(await session.load(required), copyResult);
		},
		async coordinateSnapshots(participation) {
			return wrapStream(
				await session.coordinateSnapshots(participation),
				(value) => value as SeaSnapshotCoordination,
			);
		},
		async publishSnapshot(parent, fence, position, root) {
			const tree = generatedIdentity(bindings, root);
			try {
				return copyResult(
					await session.publishSnapshot(parent, fence, position, tree),
				) as SeaSnapshot;
			} finally {
				tree.free();
			}
		},
		close() {
			closing ??= session.close().finally(() => session.free());
			return closing;
		},
	};
}

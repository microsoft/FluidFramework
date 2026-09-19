/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type * as Generated from "../generated/memory-compression/web/sea_wasm.js";
import type * as RemoteGenerated from "../generated/webtransport/web/sea_wasm.js";
import type {
	SeaSessionOptions,
	SeaTreeId,
	SeaLoadResult,
	SeaStream,
	SeaSnapshotCoordination,
	SeaSnapshot,
	SeaSession,
	SeaMemoryService,
} from "./index.js";

/** Values needed from one initialized bundle; never exposed to callers. */
type BindingModule = Pick<typeof Generated, "SeaTreeId" | "SeaSessionOptions">;

/** Initialization promises keyed by artifact and environment, not service storage. */
const initialized = new Map<string, Promise<unknown>>();

/** Initializes one generated web module exactly once per artifact. */
export function initialize<Module>(
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

/** Constructs options in the same module that will open their session. */
export function makeOptions(
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

/** Creates an independent service while retaining admitted asynchronous opens until settled. */
export function createBoundMemoryService(
	bindings: BindingModule & Pick<typeof Generated, "SeaMemoryService">,
): SeaMemoryService {
	const service = new bindings.SeaMemoryService();
	let closed = false;
	let pendingOpens = 0;
	let released = false;
	const release = (): void => {
		if (closed && pendingOpens === 0 && !released) {
			released = true;
			service.free();
		}
	};
	return {
		async open(document, sessionOptions) {
			if (closed) {
				throw Object.assign(new Error("memory service is closed"), { kind: "Closed" });
			}
			const generatedOptions = makeOptions(bindings, sessionOptions);
			pendingOpens += 1;
			try {
				return wrapSession(await service.open(document, generatedOptions), bindings);
			} finally {
				generatedOptions.free();
				pendingOpens -= 1;
				release();
			}
		},
		close() {
			if (!closed) {
				closed = true;
				release();
			}
		},
	};
}

/** Opens a remote session using options allocated by the selected module. */
export async function openBoundWebTransport(
	bindings: BindingModule & Pick<typeof RemoteGenerated, "openWebTransport">,
	service: { readonly url: string; readonly certificateHash: Uint8Array },
	document: Uint8Array | undefined,
	options: SeaSessionOptions,
): Promise<SeaSession> {
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
export function wrapSession(
	session: Generated.SeaSession,
	bindings: BindingModule,
): SeaSession {
	let closing: Promise<void> | undefined;
	let closed = false;
	let closeSettled = false;
	let pendingOperations = 0;
	let released = false;
	const requireOpen = (): void => {
		if (closed) {
			throw Object.assign(new Error("session is closed"), { kind: "Closed" });
		}
	};
	const release = (): void => {
		if (closeSettled && pendingOperations === 0 && !released) {
			released = true;
			session.free();
		}
	};
	const invoke = async <Result>(operation: () => Promise<Result>): Promise<Result> => {
		requireOpen();
		pendingOperations += 1;
		try {
			return await operation();
		} finally {
			pendingOperations -= 1;
			release();
		}
	};
	return {
		document: session.document,
		putBlob: (payload) => invoke(async () => copyIdentity(await session.putBlob(payload))),
		getBlob: (id) =>
			invoke(async () => {
				const tree = generatedIdentity(bindings, id);
				try {
					return await session.getBlob(tree);
				} finally {
					tree.free();
				}
			}),
		putDirectory: (entries) =>
			invoke(async () => {
				return copyIdentity(
					await session.putDirectory(
						entries.map((entry) => entry.name),
						entries.map((entry) => generatedIdentity(bindings, entry.child)),
					),
				);
			}),
		getDirectory: (id) =>
			invoke(async () => {
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
			}),
		submit: (operation, reference, payload, blobTree) =>
			invoke(async () => {
				const tree =
					blobTree === undefined ? undefined : generatedIdentity(bindings, blobTree);
				try {
					return await session.submit(operation, reference, payload, tree);
				} finally {
					tree?.free();
				}
			}),
		resolveSubmission: (operation) => invoke(() => session.resolveSubmission(operation)),
		read(after, stopAfter) {
			requireOpen();
			return wrapStream(session.read(after, stopAfter), copyResult);
		},
		load: (required) =>
			invoke(async () => wrapStream(await session.load(required), copyResult)),
		getSnapshot: (required) =>
			invoke(async () => {
				const result: unknown = await session.getSnapshot(required);
				return result === undefined ? undefined : (copyResult(result) as SeaSnapshot);
			}),
		coordinateSnapshots: (participation) =>
			invoke(async () => {
				return wrapStream(
					await session.coordinateSnapshots(participation),
					(value) => value as SeaSnapshotCoordination,
				);
			}),
		publishSnapshot: (parent, fence, position, root) =>
			invoke(async () => {
				const tree = generatedIdentity(bindings, root);
				try {
					return copyResult(
						await session.publishSnapshot(parent, fence, position, tree),
					) as SeaSnapshot;
				} finally {
					tree.free();
				}
			}),
		close() {
			if (closing === undefined) {
				closed = true;
				closing = session.close().finally(() => {
					closeSettled = true;
					release();
				});
			}
			return closing;
		},
	};
}

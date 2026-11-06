/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionState } from "@fluidframework/container-loader";
import { Loader } from "@fluidframework/container-loader/internal";
import type {
	IDocumentStorageService,
	IResolvedUrl,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";
import {
	createDOProviderContainerRuntimeFactory,
	createFluidContainer,
} from "@fluidframework/fluid-static/internal";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver/internal";
import {
	SeaDriver,
	SeaDocumentStorage,
	SeaSessionDriverClient,
	type SeaSessionFactory,
} from "@fluidframework/sea-driver/internal";
import { DirectSharedTreeClient } from "@fluidframework/sea-tree/internal";
import { openWebTransport } from "@fluidframework/sea-typescript/internal/webtransport";
import {
	InsecureTinyliciousTokenProvider,
	InsecureTinyliciousUrlResolver,
	createTinyliciousCreateNewRequest,
} from "@fluidframework/tinylicious-driver/internal";
import {
	SchemaFactoryAlpha,
	TreeViewConfigurationAlpha,
	incrementalEncodingPolicyForAllowedTypes,
	incrementalSummaryHint,
} from "@fluidframework/tree/alpha";
import {
	ForestTypeOptimized,
	configuredSharedTreeBetaLegacy,
} from "@fluidframework/tree/legacy";

const sf = new SchemaFactoryAlpha("sea-snapshot-benchmark");
class Values extends sf.array("Values", sf.string) {}
class Block extends sf.object("Block", {
	values: sf.types([Values], { custom: { [incrementalSummaryHint]: true } }),
}) {}
class Blocks extends sf.array("Blocks", Block) {}
class State extends sf.object("State", { blocks: Blocks, payload: sf.optional(sf.handle) }) {}
const configuration = new TreeViewConfigurationAlpha({ schema: State });
const schema = {
	initialObjects: {
		tree: configuredSharedTreeBetaLegacy({ forest: ForestTypeOptimized }),
	},
};
const parameters = new URLSearchParams(location.search);
const backend = parameters.get("backend");
const bytes = integer("bytes", 1024 * 1024);
const blobBytes = integer("blobBytes", 0, 0);
const rows = Math.ceil(bytes / 1024);
const rowsPerBlock = 32;
const calls: { name: string; start: number; end: number; bytes?: number }[] = [];
const expectedValues = Array.from({ length: rows }, (_, index) => value(index));

declare global {
	interface Window {
		__snapshotResult?: Promise<Record<string, unknown>>;
	}
}

function integer(name: string, fallback: number, minimum = 1): number {
	const result = Number(parameters.get(name) ?? fallback);
	if (!Number.isSafeInteger(result) || result < minimum) throw new Error(`Invalid ${name}`);
	return result;
}

function boolean(name: string): boolean {
	const value = parameters.get(name) ?? "false";
	if (value !== "true" && value !== "false") throw new Error(`Invalid ${name}`);
	return value === "true";
}

/** Reproducible, distinct ASCII values; the small alphabet is intentionally compressible. */
function value(index: number): string {
	let state = (index + 1) * 2654435761;
	let result = `${index}:`;
	while (result.length < 1024) {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		result += state.toString(16).padStart(8, "0");
	}
	return result.slice(0, 1024);
}

function initialState(): { blocks: { values: string[] }[] } {
	return {
		blocks: Array.from({ length: Math.ceil(rows / rowsPerBlock) }, (_, block) => ({
			values: expectedValues.slice(
				block * rowsPerBlock,
				Math.min(rows, (block + 1) * rowsPerBlock),
			),
		})),
	};
}

function verify(root: State): void {
	let index = 0;
	for (const block of root.blocks) {
		for (const actual of block.values) {
			if (actual !== expectedValues[index++]) throw new Error(`Incorrect row ${index - 1}`);
		}
	}
	if (index !== rows) throw new Error(`Expected ${rows} rows, got ${index}`);
}

async function until(condition: () => boolean, label: string): Promise<void> {
	const deadline = performance.now() + 120_000;
	while (!condition()) {
		if (performance.now() > deadline) throw new Error(`Timed out: ${label}`);
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

async function timed<T>(name: string, action: () => Promise<T>): Promise<T> {
	const start = performance.now();
	const result = await action();
	calls.push({
		name,
		start,
		end: performance.now(),
		...(result instanceof Uint8Array ? { bytes: result.byteLength } : {}),
	});
	return result;
}

function seaClient(direct: boolean): SeaSessionDriverClient {
	const hash = Uint8Array.from(parameters.get("hash")?.match(/../gu) ?? [], (part) =>
		Number.parseInt(part, 16),
	);
	const url = parameters.get("transport");
	if (url === null || hash.length !== 32) throw new Error("Missing Sea endpoint");
	const compression = boolean("compression");
	const factory: SeaSessionFactory = (document, options) =>
		timed("session.open", async () =>
			openWebTransport(
				{
					url,
					certificateHash: hash,
					configuration: compression ? "webtransport-compression" : "webtransport",
				},
				document,
				{ ...options, compression },
			),
		);
	const client = new SeaSessionDriverClient(
		factory,
		direct ? "seaSelected" : "clientSelected",
		{
			loadingHint:
				backend === "direct"
					? {
							includeDescendantBlobs: boolean("prefetchBlobs"),
							maxExtraItems: integer("prefetchItems", 4096),
						}
					: { maxExtraItems: 0 },
		},
	);
	const fetchBlob = client.fetchBlob.bind(client);
	client.fetchBlob = async (id) => timed("blob", async () => fetchBlob(id));
	const fetchBlobs = client.fetchBlobs.bind(client);
	client.fetchBlobs = async (ids) => timed("blobs", async () => fetchBlobs(ids));
	const fetchSummary = client.fetchSummary.bind(client);
	client.fetchSummary = async (id) => timed("manifest", async () => fetchSummary(id));
	const load = client.loadDirectSnapshot.bind(client);
	client.loadDirectSnapshot = async () => timed("snapshot", load);
	const openDirectSession = client.openDirectSession.bind(client);
	client.openDirectSession = async (...args) =>
		timed("direct.open", async () => openDirectSession(...args));
	const announceMembership = client.announceMembership.bind(client);
	client.announceMembership = async (metadata) =>
		timed("membership", async () => announceMembership(metadata));
	return client;
}

function documentBytes(id: string): Uint8Array {
	if (!/^(?:[0-9a-f]{2})+$/u.test(id)) throw new Error("Invalid Sea document ID");
	return Uint8Array.from(id.match(/../gu) ?? [], (part) => Number.parseInt(part, 16));
}

function documentHex(id: Uint8Array): string {
	return [...id].map((part) => part.toString(16).padStart(2, "0")).join("");
}

async function directDocument(seed: boolean, id: string) {
	const client = seaClient(true);
	let blobReads = 0;
	const fetchBlob = client.fetchBlob.bind(client);
	client.fetchBlob = async (digest) => {
		blobReads++;
		return fetchBlob(digest);
	};
	const host = await DirectSharedTreeClient.create(
		client,
		seed ? new Uint8Array() : documentBytes(id),
		64,
		1024 * 1024,
		seed,
		{
			blobLoading: boolean("prefetchBlobs") ? "eager" : "lazy",
			summaryIdleMs: 3_600_000,
			summaryMaxOperations: Number.MAX_SAFE_INTEGER,
			shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(configuration),
		},
	);
	const view = host.tree.viewWith(configuration);
	try {
		if (seed) {
			view.initialize({ blocks: [] });
			await host.waitForIdle();
			for (const block of initialState().blocks) {
				view.root.blocks.insertAtEnd(block);
				await host.waitForIdle();
			}
			if (blobBytes > 0) {
				view.root.payload = host.createBlob(new Uint8Array(blobBytes).fill(173));
				await host.waitForIdle();
			}
			await until(() => client.canPublishSnapshot, "snapshot nomination");
			await host.summarize();
			if (host.summaryCount !== 1) throw new Error("Initial summary was not published");
		} else if (!host.loadedFromSummary) {
			throw new Error("Load replayed history instead of loading a snapshot");
		}
		return {
			id: documentHex(host.documentId),
			root: view.root,
			blobReadCount: () => blobReads,
			close: async () => {
				view.dispose();
				await host.dispose();
			},
		};
	} catch (error) {
		view.dispose();
		await host.dispose();
		throw error;
	}
}

async function fluidDocument(seed: boolean, id: string) {
	const tinylicious = backend === "tinylicious";
	const clients: SeaSessionDriverClient[] = [];
	const serviceFactory = tinylicious
		? new RouterliciousDocumentServiceFactory(new InsecureTinyliciousTokenProvider())
		: new SeaDriver(async () => {
				const client = seaClient(false);
				clients.push(client);
				return client;
			});
	const resolved: IResolvedUrl = {
		type: "fluid",
		id: seed ? `snapshot-${crypto.randomUUID()}` : id,
		url: `fluid://localhost/snapshot/${id}`,
		tokens: {},
		endpoints: {},
	};
	const codeDetails = { package: "snapshot-benchmark", config: {} };
	const runtimeFactory = createDOProviderContainerRuntimeFactory({
		schema,
		minVersionForCollaboration: "2.74.0",
		runtimeOptionOverrides: {
			summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
		},
	});
	const loader = new Loader({
		documentServiceFactory: serviceFactory,
		urlResolver: tinylicious
			? new InsecureTinyliciousUrlResolver({
					endpoint: "http://127.0.0.2",
					port: integer("port", 7070),
				})
			: {
					resolve: async () => resolved,
					getAbsoluteUrl: async () => resolved.url,
				},
		codeLoader: {
			load: async () => ({ module: { fluidExport: runtimeFactory }, details: codeDetails }),
		},
	});
	const container = seed
		? await loader.createDetachedContainer(codeDetails)
		: await loader.resolve({ url: tinylicious ? id : resolved.url });
	const fluid = await createFluidContainer<typeof schema>({ container });
	const view = fluid.initialObjects.tree.viewWith(configuration);
	const close = async (): Promise<void> => {
		view.dispose();
		fluid.dispose();
		for (const client of clients) client.disconnect();
		await Promise.all(clients.map(async (client) => client.reconnect()));
	};
	try {
		if (seed) {
			view.initialize(initialState());
			await container.attach(
				tinylicious ? createTinyliciousCreateNewRequest() : { url: resolved.url },
			);
		}
		await until(
			() => container.connectionState === ConnectionState.Connected,
			"Fluid connection",
		);
		if (container.resolvedUrl?.type !== "fluid") throw new Error("Missing document URL");
		return { id: container.resolvedUrl.id, root: view.root, blobReadCount: () => 0, close };
	} catch (error) {
		await close();
		throw error;
	}
}

async function open(seed: boolean, id: string) {
	return backend === "direct" || backend === "direct-demand"
		? directDocument(seed, id)
		: fluidDocument(seed, id);
}

async function load(id: string, scheduledAt = performance.now()) {
	const started = performance.now();
	const opened = await open(false, id);
	try {
		if (opened.root.blocks[0]?.values[0] !== expectedValues[0]) {
			throw new Error("Representative read failed");
		}
		const ready = performance.now();
		verify(opened.root);
		const verified = performance.now();
		const readsBefore = opened.blobReadCount();
		const blobStarted = performance.now();
		if (blobBytes > 0) {
			const content = await opened.root.payload?.get();
			if (
				!(content instanceof ArrayBuffer) ||
				content.byteLength !== blobBytes ||
				new Uint8Array(content).some((byte) => byte !== 173)
			) {
				throw new Error("Blob-handle payload verification failed");
			}
		}
		const blobReadMilliseconds = performance.now() - blobStarted;
		const blobReadCalls = opened.blobReadCount() - readsBefore;
		if (blobBytes > 0 && blobReadCalls !== (boolean("prefetchBlobs") ? 0 : 1)) {
			throw new Error(`Unexpected post-load blob read count: ${blobReadCalls}`);
		}
		return {
			status: "passed",
			milliseconds: ready - started,
			scheduledMilliseconds: ready - scheduledAt,
			schedulerLagMilliseconds: started - scheduledAt,
			traversalMilliseconds: verified - ready,
			verifiedRows: rows,
			...(blobBytes === 0
				? {}
				: { verifiedBlobBytes: blobBytes, blobReadMilliseconds, blobReadCalls }),
		};
	} finally {
		await opened.close();
	}
}

let downloadBaseline: { version: string; fingerprint: string } | undefined;

/** Storage-only control: retrieve a pinned manifest and all unique blobs with eight readers. */
async function download(id: string, scheduledAt = performance.now()) {
	const started = performance.now();
	let storage: IDocumentStorageService;
	let close: () => Promise<void>;
	if (backend === "tinylicious") {
		const resolver = new InsecureTinyliciousUrlResolver({
			endpoint: "http://127.0.0.2",
			port: integer("port", 7070),
		});
		const resolved = await resolver.resolve({ url: id });
		const factory = new RouterliciousDocumentServiceFactory(
			new InsecureTinyliciousTokenProvider(),
		);
		const service = await factory.createDocumentService(resolved);
		close = async () => service.dispose();
		try {
			storage = await service.connectToStorage();
		} catch (error) {
			await close();
			throw error;
		}
	} else {
		const client = seaClient(backend !== "sea-fluid");
		close = async () => {
			client.disconnect();
			await client.reconnect();
		};
		try {
			const session = new TextEncoder().encode(crypto.randomUUID());
			if (backend === "sea-fluid") {
				await client.openSession(documentBytes(id), session);
			} else {
				await client.openDirectSession(documentBytes(id), session);
				await client.loadDirectSnapshot();
			}
			storage = new SeaDocumentStorage(client);
		} catch (error) {
			await close();
			throw error;
		}
	}
	try {
		const version = (await storage.getVersions(downloadBaseline?.version ?? null, 1))[0];
		if (version === undefined) throw new Error("Missing download snapshot");
		const tree = await storage.getSnapshotTree(version);
		if (tree === null) throw new Error("Missing snapshot manifest");
		const ids = new Set<string>();
		const visit = (node: ISnapshotTree): void => {
			for (const blob of Object.values(node.blobs)) ids.add(blob);
			for (const child of Object.values(node.trees)) visit(child);
		};
		visit(tree);
		const pending = [...ids];
		const blobs: Uint8Array[] = [];
		await Promise.all(
			Array.from({ length: 8 }, async () => {
				for (;;) {
					const blob = pending.pop();
					if (blob === undefined) break;
					blobs.push(new Uint8Array(await storage.readBlob(blob)));
				}
			}),
		);
		const ready = performance.now();
		const hashes = await Promise.all(
			blobs.map(async (blob) =>
				documentHex(
					new Uint8Array(await crypto.subtle.digest("SHA-256", blob.slice().buffer)),
				),
			),
		);
		const fingerprint = hashes.sort().join(",");
		downloadBaseline ??= { version: version.id, fingerprint };
		if (
			version.id !== downloadBaseline.version ||
			fingerprint !== downloadBaseline.fingerprint
		) {
			throw new Error("Downloaded snapshot differs from its pinned baseline");
		}
		return {
			status: "passed",
			milliseconds: ready - started,
			scheduledMilliseconds: ready - scheduledAt,
			schedulerLagMilliseconds: started - scheduledAt,
			blobBytes: blobs.reduce((sum, blob) => sum + blob.byteLength, 0),
			blobs: blobs.length,
		};
	} finally {
		await close();
	}
}

async function run(): Promise<Record<string, unknown>> {
	if (!["direct", "direct-demand", "sea-fluid", "tinylicious"].includes(backend ?? "")) {
		throw new Error("Invalid snapshot backend");
	}
	if (blobBytes > 0 && backend !== "direct" && backend !== "direct-demand") {
		throw new Error("The blob-handle workload currently requires a direct backend");
	}
	const action = parameters.get("action") ?? "load";
	const id = parameters.get("document") ?? "";
	if (action === "seed") {
		const opened = await open(true, "");
		try {
			verify(opened.root);
			return { status: "passed", document: opened.id, logicalBytes: rows * 1024 };
		} finally {
			await opened.close();
		}
	}
	if (action === "load") {
		const sample = await load(id);
		return { ...sample, calls, browser: navigator.userAgent };
	}
	if (action !== "capacity") throw new Error("Invalid snapshot action");
	// Warm module/WASM initialization without retaining client, driver, or container caches.
	await load(id);
	const measure = parameters.get("workload") === "download" ? download : load;
	if (measure === download) await download(id);
	calls.length = 0;
	const concurrency = integer("concurrency", 1);
	const count = integer("count", 20);
	const rate = Number(parameters.get("rate") ?? 0);
	if (!Number.isFinite(rate) || rate < 0) throw new Error("Invalid offered rate");
	const samples: Record<string, unknown>[] = [];
	const startAt = Number(parameters.get("startAt") ?? 0);
	if (startAt > 0) {
		if (Date.now() > startAt) throw new Error("Capacity worker missed its start barrier");
		await new Promise((resolve) => setTimeout(resolve, startAt - Date.now()));
	}
	const startedAt = performance.timeOrigin + performance.now();
	const started = performance.now();
	let active = 0;
	let peakActive = 0;
	let next = 0;
	const attempt = async (scheduled: number): Promise<void> => {
		active++;
		peakActive = Math.max(peakActive, active);
		try {
			samples.push(await measure(id, scheduled));
		} catch (error) {
			samples.push({
				status: "failed",
				error: String(error),
				scheduledMilliseconds: performance.now() - scheduled,
			});
		} finally {
			active--;
		}
	};
	if (rate > 0) {
		const pending: Promise<void>[] = [];
		for (let index = 0; index < count; index++) {
			const scheduled = started + (index * 1000) / rate;
			await new Promise((resolve) =>
				setTimeout(resolve, Math.max(0, scheduled - performance.now())),
			);
			pending.push(attempt(scheduled));
		}
		await Promise.all(pending);
	} else {
		await Promise.all(
			Array.from({ length: concurrency }, async () => {
				while (next++ < count) await attempt(performance.now());
			}),
		);
	}
	if (rate > 0) {
		await new Promise((resolve) =>
			setTimeout(resolve, Math.max(0, started + (count * 1000) / rate - performance.now())),
		);
	}
	const elapsedMilliseconds = performance.now() - started;
	const completed = samples.filter((sample) => sample.status === "passed").length;
	return {
		status: completed === count ? "passed" : "failed",
		completed,
		failed: count - completed,
		elapsedMilliseconds,
		startedAt,
		endedAt: performance.timeOrigin + performance.now(),
		loadsPerSecond: (completed * 1000) / elapsedMilliseconds,
		logicalMiBPerSecond: (completed * rows * 1024 * 1000) / elapsedMilliseconds / 1024 ** 2,
		peakActive,
		samples,
		browser: navigator.userAgent,
	};
}

window.__snapshotResult = run().catch((error: unknown) => ({
	status: "failed",
	error: error instanceof Error ? (error.stack ?? error.message) : String(error),
}));

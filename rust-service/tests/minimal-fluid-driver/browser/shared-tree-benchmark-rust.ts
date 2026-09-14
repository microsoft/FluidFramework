import { ConnectionState } from "@fluidframework/container-loader";
import { Loader } from "@fluidframework/container-loader/internal";
import type { IRequest } from "@fluidframework/core-interfaces";
import type {
	IClient,
	IResolvedUrl,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import {
	createDOProviderContainerRuntimeFactory,
	createFluidContainer,
} from "@fluidframework/fluid-static/internal";
import { Tree } from "@fluidframework/tree";

import init, {
	BrowserClient,
	InjectedClient,
	SummaryEntry as GeneratedSummaryEntry,
} from "../pkg/fluid_webtransport_browser.js";
import initLocalService, {
	LocalServiceTransport,
} from "../pkg-local/fluid_native_service_browser.js";
import {
	type MinimalWasmDeltaConnection,
	MinimalWasmDocumentServiceFactory,
} from "../src/index.js";
import type { WasmProtocolClient } from "../src/wasmClient.js";
import {
	runSharedTreeBenchmark,
	type SharedTreeBenchmarkPair,
} from "./shared-tree-benchmark-core.js";
import {
	benchmarkContainerSchema,
	benchmarkTreeConfiguration,
} from "./shared-tree-benchmark-schema.js";

declare global {
	interface Window {
		__sharedTreeBenchmarkResult?: Promise<Record<string, unknown>>;
	}
}

const parameters = new URLSearchParams(location.search);
const codeDetails = { package: "shared-tree-rust-service-benchmark", config: {} };

function adaptBrowserClient(client: BrowserClient): WasmProtocolClient {
	return {
		request: async (frame) => client.request(frame),
		openSubmissionStream: async (document) => {
			const stream = await client.openSubmissionStream(document);
			return {
				send: async (frame) => stream.send(frame),
				next: async () => stream.next(),
				close: async () => stream.close(),
			};
		},
		readProjected: async (document, after) => {
			const page = await client.readProjected(document, after);
			return {
				operations: page.operations.map((operation) => ({
					position: operation.position,
					sequenceNumber: operation.sequenceNumber,
					...(operation.minimumReference === undefined
						? {}
						: { minimumReference: operation.minimumReference }),
					writer: operation.writer,
					session: operation.session,
					submission: operation.submission,
					localSequenceNumber: operation.localSequenceNumber,
					...(operation.reference === undefined ? {} : { reference: operation.reference }),
					payload: operation.payload,
				})),
				...(page.cursor === undefined ? {} : { cursor: page.cursor }),
				hasMore: page.hasMore,
			};
		},
		subscribeProjected: async (document, after) => {
			const subscription = await client.subscribeProjected(document, after);
			return {
				next: async () => {
					const operation = await subscription.next();
					return {
						position: operation.position,
						sequenceNumber: operation.sequenceNumber,
						...(operation.minimumReference === undefined
							? {}
							: { minimumReference: operation.minimumReference }),
						writer: operation.writer,
						session: operation.session,
						submission: operation.submission,
						localSequenceNumber: operation.localSequenceNumber,
						...(operation.reference === undefined ? {} : { reference: operation.reference }),
						payload: operation.payload,
					};
				},
				cancel: async () => subscription.cancel(),
			};
		},
		resolveSubmission: async (document, writer, session, submission) => {
			const resolution = await client.resolveSubmission(document, writer, session, submission);
			if (resolution.kind === "committed") {
				if (resolution.position === undefined || resolution.sequenceNumber === undefined) {
					throw new Error("committed resolution omitted its position or sequence number");
				}
				return {
					kind: resolution.kind,
					position: resolution.position,
					sequenceNumber: resolution.sequenceNumber,
				};
			}
			if (resolution.kind !== "notCommitted" && resolution.kind !== "stillUncertain") {
				throw new Error(`unknown submission resolution ${resolution.kind}`);
			}
			return { kind: resolution.kind };
		},
		uploadBlob: async (payload) => client.uploadBlob(payload),
		fetchBlob: async (digest) => client.fetchBlob(digest),
		publishSummary: async (entries) =>
			client.publishSummary(
				entries.map((entry) => new GeneratedSummaryEntry(entry.path, entry.blob)),
			),
		fetchSummary: async (digest) => client.fetchSummary(digest),
		disconnect: () => client.disconnect(),
		reconnect: async () => client.reconnect(),
		get wireBytes() {
			return client.wireBytes;
		},
		get peakResponseBytes() {
			return client.peakResponseBytes;
		},
		get peakSubscriptionFrameBytes() {
			return client.peakSubscriptionFrameBytes;
		},
		get peakSubscriptionQueueDepth() {
			return client.peakSubscriptionQueueDepth;
		},
	};
}

function adaptInjectedClient(
	client: InjectedClient,
	transport: LocalServiceTransport,
): WasmProtocolClient {
	return {
		request: async (frame) => client.request(frame),
		readProjected: async (document, after) => {
			const page = await client.readProjected(document, after);
			return {
				operations: page.operations.map((operation) => ({
					position: operation.position,
					sequenceNumber: operation.sequenceNumber,
					...(operation.minimumReference === undefined
						? {}
						: { minimumReference: operation.minimumReference }),
					writer: operation.writer,
					session: operation.session,
					submission: operation.submission,
					localSequenceNumber: operation.localSequenceNumber,
					...(operation.reference === undefined ? {} : { reference: operation.reference }),
					payload: operation.payload,
				})),
				...(page.cursor === undefined ? {} : { cursor: page.cursor }),
				hasMore: page.hasMore,
			};
		},
		subscribeProjected: async (document, after) => {
			const subscription = client.subscribeProjected(document, after);
			return {
				next: async () => {
					const operation = await subscription.next();
					return {
						position: operation.position,
						sequenceNumber: operation.sequenceNumber,
						...(operation.minimumReference === undefined
							? {}
							: { minimumReference: operation.minimumReference }),
						writer: operation.writer,
						session: operation.session,
						submission: operation.submission,
						localSequenceNumber: operation.localSequenceNumber,
						...(operation.reference === undefined ? {} : { reference: operation.reference }),
						payload: operation.payload,
					};
				},
				cancel: async () => subscription.cancel(),
			};
		},
		resolveSubmission: async (document, writer, session, submission) => {
			const resolution = await client.resolveSubmission(document, writer, session, submission);
			if (resolution.kind === "committed") {
				if (resolution.position === undefined || resolution.sequenceNumber === undefined) {
					throw new Error("committed resolution omitted its position or sequence number");
				}
				return {
					kind: resolution.kind,
					position: resolution.position,
					sequenceNumber: resolution.sequenceNumber,
				};
			}
			if (resolution.kind !== "notCommitted" && resolution.kind !== "stillUncertain") {
				throw new Error(`unknown submission resolution ${resolution.kind}`);
			}
			return { kind: resolution.kind };
		},
		uploadBlob: async (payload) => client.uploadBlob(payload),
		fetchBlob: async (digest) => client.fetchBlob(digest),
		publishSummary: async (entries) =>
			client.publishSummary(
				entries.map((entry) => new GeneratedSummaryEntry(entry.path, entry.blob)),
			),
		fetchSummary: async (digest) => client.fetchSummary(digest),
		disconnect: () => client.disconnect(),
		reconnect: async () => client.reconnect(transport),
		get wireBytes() {
			return client.wireBytes;
		},
		get peakResponseBytes() {
			return client.peakResponseBytes;
		},
		get peakSubscriptionFrameBytes() {
			return client.peakSubscriptionFrameBytes;
		},
		get peakSubscriptionQueueDepth() {
			return client.peakSubscriptionQueueDepth;
		},
	};
}

async function waitForConnected(container: {
	readonly connectionState: ConnectionState;
	on(event: "connected", listener: () => void): void;
	off(event: "connected", listener: () => void): void;
}): Promise<void> {
	if (container.connectionState === ConnectionState.Connected) {
		return;
	}
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => {
			container.off("connected", connected);
			reject(new Error("timed out waiting for the Rust-service container to connect"));
		}, 10_000);
		const connected = (): void => {
			clearTimeout(timeout);
			container.off("connected", connected);
			resolve();
		};
		container.on("connected", connected);
	});
}

async function createPair(): Promise<SharedTreeBenchmarkPair> {
	const local = parameters.get("local") === "true";
	const transportUrl = parameters.get("transport");
	const certificateHex = parameters.get("hash");
	if (!local && (transportUrl === null || certificateHex?.length !== 64)) {
		throw new Error("missing Rust-service transport URL or certificate hash");
	}
	await init();
	if (local) {
		await initLocalService();
	}
	const hash = Uint8Array.from(certificateHex?.match(/../gu) ?? [], (value) =>
		Number.parseInt(value, 16),
	);
	const transports: Array<BrowserClient | InjectedClient> = [];
	const localService = local ? new LocalServiceTransport(1024 * 1024) : undefined;
	const deltaConnections: MinimalWasmDeltaConnection[] = [];
	const documentId = `shared-tree-benchmark-${Date.now()}`;
	const resolvedUrl: IResolvedUrl = {
		type: "fluid",
		id: documentId,
		url: `fluid://localhost/minimal/${documentId}`,
		tokens: {},
		endpoints: {},
	};
	const urlResolver: IUrlResolver = {
		resolve: async (_request: IRequest) => resolvedUrl,
		getAbsoluteUrl: async (_resolvedUrl: IResolvedUrl, relativeUrl: string) => relativeUrl,
	};
	const documentServiceFactory = new MinimalWasmDocumentServiceFactory(
		async () => {
			if (localService !== undefined) {
				const client = new InjectedClient(localService, 1024 * 1024);
				transports.push(client);
				return adaptInjectedClient(client, localService);
			}
			if (transportUrl === null) {
				throw new Error("missing Rust-service transport URL");
			}
			const transport = await BrowserClient.connect(transportUrl, hash, 1024 * 1024);
			transports.push(transport);
			return adaptBrowserClient(transport);
		},
		{ onDeltaConnection: (connection) => deltaConnections.push(connection) },
	);
	const runtimeFactory = createDOProviderContainerRuntimeFactory({
		schema: benchmarkContainerSchema,
		minVersionForCollaboration: "2.0.0",
		runtimeOptionOverrides: {
			summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
		},
	});
	const codeLoader = {
		load: async () => ({ module: { fluidExport: runtimeFactory }, details: codeDetails }),
	};
	const client: IClient = {
		details: { capabilities: { interactive: true } },
		permission: [],
		scopes: [],
		user: { id: "shared-tree-benchmark" },
		mode: "write",
	};
	const makeLoader = (): Loader =>
		new Loader({
			urlResolver,
			documentServiceFactory,
			codeLoader,
			configProvider: {
				getRawConfig: (name) =>
					name === "Fluid.Container.ForceWriteConnection" ? true : undefined,
			},
			options: { client },
		});

	const firstContainer = await makeLoader().createDetachedContainer(codeDetails);
	const firstFluidContainer = await createFluidContainer<typeof benchmarkContainerSchema>({
		container: firstContainer,
	});
	const firstView = firstFluidContainer.initialObjects.tree.viewWith(
		benchmarkTreeConfiguration,
	);
	firstView.initialize({ value: 0 });
	await firstContainer.attach({ url: resolvedUrl.url });
	await waitForConnected(firstContainer);

	const secondContainer = await makeLoader().resolve({ url: resolvedUrl.url });
	await waitForConnected(secondContainer);
	const secondFluidContainer = await createFluidContainer<typeof benchmarkContainerSchema>({
		container: secondContainer,
	});
	const secondView = secondFluidContainer.initialObjects.tree.viewWith(
		benchmarkTreeConfiguration,
	);
	const editCounts: [number, number] = [0, 0];
	const unsubscribeFirst = Tree.on(firstView.root, "nodeChanged", () => editCounts[0]++);
	const unsubscribeSecond = Tree.on(secondView.root, "nodeChanged", () => editCounts[1]++);
	let resumeOpenMilliseconds: number | undefined;
	let resumeFirstDeliveryMilliseconds: number | undefined;
	let resumeCursorCount = 0;
	const waitForConvergence = async (
		expectedCount: number,
		expectedValue: number,
	): Promise<void> => {
		const deadline = performance.now() + 10_000;
		while (
			editCounts[0] !== expectedCount ||
			editCounts[1] !== expectedCount ||
			firstView.root.value !== expectedValue ||
			secondView.root.value !== expectedValue
		) {
			for (const connection of deltaConnections.filter((candidate) => !candidate.disposed)) {
				await connection.waitForIdle();
			}
			if (performance.now() >= deadline) {
				throw new Error(`resume probe did not converge edit ${expectedValue}`);
			}
			await new Promise((resolve) => setTimeout(resolve, 1));
		}
	};

	return {
		backend: local
			? "rust-service-local-memory-force-write"
			: `rust-service-webtransport-${parameters.get("storage") ?? "unknown"}-force-write`,
		clientCount: 2,
		applyEdit: (clientIndex, value) => {
			(clientIndex === 0 ? firstView : secondView).root.value = value;
		},
		appliedEditCounts: () => editCounts,
		lastValues: () => [firstView.root.value, secondView.root.value],
		synchronize: async () => {
			for (const connection of deltaConnections.filter((candidate) => !candidate.disposed)) {
				await connection.waitForIdle();
			}
		},
		prepare: async () => {
			const connections = deltaConnections.filter((candidate) => !candidate.disposed);
			let probeValue = Math.max(0, firstView.root.value, secondView.root.value) + 1;
			firstView.root.value = probeValue;
			await waitForConvergence(editCounts[0], probeValue);
			const started = performance.now();
			const resumed = await Promise.all(
				connections.map(async (connection) => connection.restartSubscription()),
			);
			resumeOpenMilliseconds = performance.now() - started;
			resumeCursorCount = resumed.filter(Boolean).length;
			if (resumeCursorCount !== connections.length) {
				throw new Error("subscription resume did not use every connection's current cursor");
			}
			probeValue++;
			const deliveryStarted = performance.now();
			firstView.root.value = probeValue;
			await waitForConvergence(editCounts[0], probeValue);
			resumeFirstDeliveryMilliseconds = performance.now() - deliveryStarted;
		},
		close: () => {
			unsubscribeFirst();
			unsubscribeSecond();
			firstView.dispose();
			secondView.dispose();
			firstContainer.close();
			secondContainer.close();
		},
		metrics: () => ({
			browser: navigator.userAgent,
			wireBytes: transports
				.reduce((total, transport) => total + transport.wireBytes, 0n)
				.toString(),
			peakResponseBytes: Math.max(
				...transports.map((transport) => transport.peakResponseBytes),
			),
			peakSubscriptionFrameBytes: Math.max(
				...transports.map((transport) => transport.peakSubscriptionFrameBytes),
			),
			peakSubscriptionQueueDepth: Math.max(
				...transports.map((transport) => transport.peakSubscriptionQueueDepth),
			),
			resumeOpenMilliseconds,
			resumeFirstDeliveryMilliseconds,
			resumeCursorCount,
			forceWriteConnection: true,
		}),
	};
}

function numberParameter(name: string, fallback: number): number {
	const value = parameters.get(name);
	return value === null ? fallback : Number(value);
}

window.__sharedTreeBenchmarkResult = runSharedTreeBenchmark(createPair, {
	operationCount: numberParameter("operations", 100),
	warmupOperationCount: numberParameter("warmup", 10),
	operationsPerTurn: numberParameter("operationsPerTurn", Number.POSITIVE_INFINITY),
	synchronizePerTurn: parameters.get("synchronizePerTurn") === "true",
}).catch((error: unknown) => ({
	status: "failed",
	error: error instanceof Error ? (error.stack ?? error.message) : String(error),
}));

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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

import init, * as SeaBindings from "../../../crates/sea-webtransport/test-support/pkg/web/sea_webtransport_test_support.js";
import {
	SeaBrowserTransport,
	SeaInjectedClient,
	SeaLocalService,
	type SeaLocalClient,
} from "../../../crates/sea-webtransport/test-support/pkg/web/sea_webtransport_test_support.js";
import {
	DirectDummyClient,
	DirectSharedTreeClient,
	type SeaDeltaConnection,
	SeaDriver,
} from "../src/index.js";
import type { SeaDriverClient } from "../src/wasmClient.js";
import { createGeneratedSeaBindingAdapter } from "../src/generatedSeaBinding.js";
import {
	adaptInitialObject,
	adaptSharedTree,
	parseBenchmarkDataStructure,
} from "./benchmark-data-object.js";
import {
	runSharedTreeBenchmark,
	type SharedTreeBenchmarkPair,
} from "./shared-tree-benchmark-core.js";
import {
	benchmarkContainerSchema,
	benchmarkTreeConfiguration,
} from "./shared-tree-benchmark-schema.js";

/** Browser result hook read by the headless benchmark runner. */
declare global {
	/** Benchmark-specific browser globals. */
	interface Window {
		/** Promise resolving to the detailed benchmark sample. */
		__sharedTreeBenchmarkResult?: Promise<Record<string, unknown>>;
	}
}

/** Browser query parameters supplied by the headless benchmark runner. */
const parameters = new URLSearchParams(location.search);
/** UTF-8 encoder for direct rust-service document identifiers. */
const encoder = new TextEncoder();
/** DDS implementation selected for this benchmark sample. */
const dataStructure = parseBenchmarkDataStructure(parameters.get("dds"));
/** Maximum projected operations delivered to Fluid per subscription event. */
const subscriptionBatchMaxOperations = numberParameter("subscriptionBatchOperations", 64);
/** SharedTree integration path selected for this sample. */
const integration = parameters.get("integration") ?? "fluid";
/** Fluid code identity shared by both Rust-service benchmark containers. */
const codeDetails = { package: "shared-tree-rust-service-benchmark", config: {} };

interface TransportActivity {
	readonly unaryRequests: Record<string, number>;
	submissionStreams: number;
	projectedSubscriptions: number;
}

function snapshotTransportActivity(activity: TransportActivity): TransportActivity {
	return {
		unaryRequests: { ...activity.unaryRequests },
		submissionStreams: activity.submissionStreams,
		projectedSubscriptions: activity.projectedSubscriptions,
	};
}

/** Adapts a generated remote Sea client to the minimal driver contract. */
function adaptSeaBrowserClient(
	client: SeaInjectedClient,
	reconnect: () => Promise<SeaBrowserTransport>,
): SeaDriverClient {
	return createGeneratedSeaBindingAdapter(client, SeaBindings, reconnect);
}

/** Waits for a Rust-service-backed container to reach Fluid's connected state. */
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

/** Creates a two-client Rust local or WebTransport benchmark backend. */
async function createPair(): Promise<SharedTreeBenchmarkPair> {
	const local = parameters.get("local") === "true";
	const transportUrl = parameters.get("transport");
	const certificateHex = parameters.get("hash");
	if (!local && (transportUrl === null || certificateHex?.length !== 64)) {
		throw new Error("missing Rust-service transport URL or certificate hash");
	}
	await init();
	const hash = Uint8Array.from(certificateHex?.match(/../gu) ?? [], (value) =>
		Number.parseInt(value, 16),
	);
	const transports: SeaDriverClient[] = [];
	const transportActivity: TransportActivity = {
		unaryRequests: {},
		submissionStreams: 0,
		projectedSubscriptions: 0,
	};
	const localService = local ? await SeaLocalService.create() : undefined;
	const createWasmClient = async (): Promise<SeaDriverClient> => {
		if (localService !== undefined) {
			const client: SeaLocalClient = localService.connect();
			const adapted = createGeneratedSeaBindingAdapter(client, SeaBindings);
			transports.push(adapted);
			return adapted;
		}
		if (transportUrl === null) {
			throw new Error("missing Rust-service transport URL");
		}
		const createTransport = async (): Promise<SeaBrowserTransport> =>
			SeaBrowserTransport.connect(transportUrl, hash, 1024 * 1024);
		const transport = await createTransport();
		const adapted = adaptSeaBrowserClient(
			new SeaInjectedClient(transport, 1024 * 1024),
			createTransport,
		);
		transports.push(adapted);
		return adapted;
	};
	const deltaConnections: SeaDeltaConnection[] = [];
	const documentId = `shared-tree-benchmark-${Date.now()}`;
	if (integration === "direct") {
		return dataStructure === "shared-tree"
			? createDirectSharedTreePair(
					encoder.encode(documentId),
					createWasmClient,
					transports,
					transportActivity,
					local,
				)
			: createDirectDummyPair(
					encoder.encode(documentId),
					createWasmClient,
					transports,
					transportActivity,
					local,
				);
	}
	if (integration !== "fluid") {
		throw new Error(`unsupported SharedTree integration ${JSON.stringify(integration)}`);
	}
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
	const documentServiceFactory = new SeaDriver(createWasmClient, {
		onDeltaConnection: (connection) => deltaConnections.push(connection),
		subscriptionBatchMaxOperations,
	});
	const containerSchema = benchmarkContainerSchema(dataStructure);
	const runtimeFactory = createDOProviderContainerRuntimeFactory({
		schema: containerSchema,
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
	const firstFluidContainer = await createFluidContainer<typeof containerSchema>({
		container: firstContainer,
	});
	const firstData = adaptInitialObject(
		firstFluidContainer.initialObjects.data,
		dataStructure,
		true,
		benchmarkTreeConfiguration,
	);
	await firstContainer.attach({ url: resolvedUrl.url });
	await waitForConnected(firstContainer);

	const secondContainer = await makeLoader().resolve({ url: resolvedUrl.url });
	await waitForConnected(secondContainer);
	const secondFluidContainer = await createFluidContainer<typeof containerSchema>({
		container: secondContainer,
	});
	const secondData = adaptInitialObject(
		secondFluidContainer.initialObjects.data,
		dataStructure,
		false,
		benchmarkTreeConfiguration,
	);
	const startupTransportActivity = snapshotTransportActivity(transportActivity);
	let resumeOpenMilliseconds: number | undefined;
	let resumeFirstDeliveryMilliseconds: number | undefined;
	let resumeCursorCount = 0;
	const waitForConvergence = async (
		expectedCount: number,
		expectedValue: number,
	): Promise<void> => {
		const deadline = performance.now() + 10_000;
		while (
			firstData.appliedOpCount !== expectedCount ||
			secondData.appliedOpCount !== expectedCount ||
			firstData.value !== expectedValue ||
			secondData.value !== expectedValue
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
		dataStructure,
		backend: local
			? "rust-service-local-memory-force-write"
			: `rust-service-webtransport-${parameters.get("storage") ?? "unknown"}-force-write`,
		clientCount: 2,
		applyEdit: (clientIndex, value) => (clientIndex === 0 ? firstData : secondData).set(value),
		appliedEditCounts: () => [firstData.appliedOpCount, secondData.appliedOpCount],
		lastValues: () => [firstData.value, secondData.value],
		synchronize: async () => {
			for (const connection of deltaConnections.filter((candidate) => !candidate.disposed)) {
				await connection.waitForIdle();
			}
		},
		prepare: async () => {
			const connections = deltaConnections.filter((candidate) => !candidate.disposed);
			let probeValue = Math.max(0, firstData.value, secondData.value) + 1;
			firstData.set(probeValue);
			await waitForConvergence(firstData.appliedOpCount, probeValue);
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
			firstData.set(probeValue);
			await waitForConvergence(firstData.appliedOpCount, probeValue);
			resumeFirstDeliveryMilliseconds = performance.now() - deliveryStarted;
		},
		close: () => {
			firstData.dispose();
			secondData.dispose();
			firstContainer.close();
			secondContainer.close();
		},
		metrics: () => ({
			browser: navigator.userAgent,
			startupTransportActivity,
			transportActivity: snapshotTransportActivity(transportActivity),
			wireBytes: null,
			peakResponseBytes: null,
			peakSubscriptionFrameBytes: null,
			peakSubscriptionQueueDepth: null,
			subscriptionBatchMaxOperations,
			subscriptionBatchCount: deltaConnections.reduce(
				(total, connection) => total + connection.subscriptionBatchCount,
				0,
			),
			peakSubscriptionBatchOperations: Math.max(
				...deltaConnections.map((connection) => connection.peakSubscriptionBatchOperations),
			),
			resumeOpenMilliseconds,
			resumeFirstDeliveryMilliseconds,
			resumeCursorCount,
			forceWriteConnection: true,
		}),
	};
}

/** Creates two production SharedTree kernels connected directly to rust-service. */
async function createDirectSharedTreePair(
	document: Uint8Array,
	createClient: () => Promise<SeaDriverClient>,
	transports: SeaDriverClient[],
	transportActivity: TransportActivity,
	local: boolean,
): Promise<SharedTreeBenchmarkPair> {
	const writer = await DirectSharedTreeClient.create(
		await createClient(),
		document,
		subscriptionBatchMaxOperations,
		1024 * 1024,
		true,
	);
	const observer = await DirectSharedTreeClient.create(
		await createClient(),
		document,
		subscriptionBatchMaxOperations,
		1024 * 1024,
		false,
	);
	const writerView = writer.tree.viewWith(benchmarkTreeConfiguration);
	writerView.initialize({ value: 0 });
	await writer.waitForIdle();
	await waitUntil(
		() => observer.lastAppliedSequenceNumber >= writer.lastAppliedSequenceNumber,
	);
	const observerView = observer.tree.viewWith(benchmarkTreeConfiguration);
	const writerData = adaptSharedTree(writerView);
	const observerData = adaptSharedTree(observerView);
	const startupTransportActivity = snapshotTransportActivity(transportActivity);
	const synchronize = async (): Promise<void> => {
		await writer.waitForIdle();
		await observer.waitForIdle();
		await waitUntil(
			() => observer.lastAppliedSequenceNumber >= writer.lastAppliedSequenceNumber,
		);
	};

	return {
		dataStructure: "shared-tree",
		backend: local
			? "rust-service-local-memory-direct-shared-tree"
			: `rust-service-webtransport-${parameters.get("storage") ?? "unknown"}-direct-shared-tree`,
		clientCount: 2,
		applyEdit: (clientIndex, value) =>
			(clientIndex === 0 ? writerData : observerData).set(value),
		appliedEditCounts: () => [writerData.appliedOpCount, observerData.appliedOpCount],
		lastValues: () => [writerData.value, observerData.value],
		synchronize,
		prepare: synchronize,
		close: async () => {
			writerData.dispose();
			observerData.dispose();
			await Promise.all([writer.dispose(), observer.dispose()]);
		},
		metrics: () => ({
			browser: navigator.userAgent,
			integration: "direct",
			startupTransportActivity,
			transportActivity: snapshotTransportActivity(transportActivity),
			wireBytes: null,
			peakResponseBytes: null,
			peakSubscriptionFrameBytes: null,
			peakSubscriptionQueueDepth: null,
			subscriptionBatchMaxOperations,
			subscriptionBatchCount: writer.deliveredBatchCount + observer.deliveredBatchCount,
			peakSubscriptionBatchOperations: Math.max(
				writer.peakDeliveredBatchOperations,
				observer.peakDeliveredBatchOperations,
			),
		}),
	};
}

/** Creates two runtime-free scalar clients connected directly to rust-service. */
async function createDirectDummyPair(
	document: Uint8Array,
	createClient: () => Promise<SeaDriverClient>,
	transports: SeaDriverClient[],
	transportActivity: TransportActivity,
	local: boolean,
): Promise<SharedTreeBenchmarkPair> {
	const writer = await DirectDummyClient.create(
		await createClient(),
		document,
		subscriptionBatchMaxOperations,
		1024 * 1024,
		true,
	);
	const observer = await DirectDummyClient.create(
		await createClient(),
		document,
		subscriptionBatchMaxOperations,
		1024 * 1024,
		false,
	);
	const synchronize = async (): Promise<void> => {
		await writer.waitForIdle();
		await observer.waitForIdle();
		await waitUntil(
			() => observer.lastAppliedSequenceNumber >= writer.lastAppliedSequenceNumber,
		);
	};
	const startupTransportActivity = snapshotTransportActivity(transportActivity);

	return {
		dataStructure: "dummy",
		backend: local
			? "rust-service-local-memory-direct-dummy"
			: `rust-service-webtransport-${parameters.get("storage") ?? "unknown"}-direct-dummy`,
		clientCount: 2,
		applyEdit: (clientIndex, value) => (clientIndex === 0 ? writer : observer).set(value),
		appliedEditCounts: () => [writer.appliedOpCount, observer.appliedOpCount],
		lastValues: () => [writer.value, observer.value],
		synchronize,
		prepare: synchronize,
		close: async () => {
			await Promise.all([writer.dispose(), observer.dispose()]);
		},
		metrics: () => ({
			browser: navigator.userAgent,
			integration: "direct",
			startupTransportActivity,
			transportActivity: snapshotTransportActivity(transportActivity),
			wireBytes: null,
			peakResponseBytes: null,
			peakSubscriptionFrameBytes: null,
			peakSubscriptionQueueDepth: null,
			subscriptionBatchMaxOperations,
			subscriptionBatchCount: writer.deliveredBatchCount + observer.deliveredBatchCount,
			peakSubscriptionBatchOperations: Math.max(
				writer.peakDeliveredBatchOperations,
				observer.peakDeliveredBatchOperations,
			),
		}),
	};
}

/** Waits for a direct-integration state predicate with a bounded timeout. */
async function waitUntil(predicate: () => boolean): Promise<void> {
	const deadline = performance.now() + 10_000;
	while (!predicate()) {
		if (performance.now() >= deadline) {
			throw new Error("timed out waiting for direct SharedTree synchronization");
		}
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

/** Reads a numeric browser parameter or returns its workload default. */
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

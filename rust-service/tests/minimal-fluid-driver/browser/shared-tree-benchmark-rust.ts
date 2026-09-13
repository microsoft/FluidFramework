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

import init, {
	BrowserClient,
	SummaryEntry as GeneratedSummaryEntry,
} from "../pkg/fluid_webtransport_browser.js";
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
	const transportUrl = parameters.get("transport");
	const certificateHex = parameters.get("hash");
	if (transportUrl === null || certificateHex?.length !== 64) {
		throw new Error("missing Rust-service transport URL or certificate hash");
	}
	await init();
	const hash = Uint8Array.from(certificateHex.match(/../gu) ?? [], (value) =>
		Number.parseInt(value, 16),
	);
	const transports: BrowserClient[] = [];
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

	return {
		backend: "rust-service-minimal-driver-force-write",
		clientCount: 2,
		setValue: (clientIndex, value) => {
			(clientIndex === 0 ? firstView : secondView).root.value = value;
		},
		values: () => [firstView.root.value, secondView.root.value],
		synchronize: async () => {
			for (const connection of deltaConnections.filter((candidate) => !candidate.disposed)) {
				await connection.waitForIdle();
				await connection.synchronize();
			}
		},
		close: () => {
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
}).catch((error: unknown) => ({ status: "failed", error: String(error) }));

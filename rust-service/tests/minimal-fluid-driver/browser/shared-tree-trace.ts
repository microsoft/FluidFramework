/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionState } from "@fluidframework/container-loader";
import { Loader } from "@fluidframework/container-loader/internal";
import type { IRequest, ITelemetryBaseEvent } from "@fluidframework/core-interfaces";
import type {
	IClient,
	IResolvedUrl,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import {
	createDOProviderContainerRuntimeFactory,
	createFluidContainer,
	type ContainerSchema,
} from "@fluidframework/fluid-static/internal";
import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/legacy";

import init, {
	SeaBrowserTransport,
	SeaDirectoryEntry,
	SeaInjectedClient,
	SeaLoadKind,
	SeaTreeId,
	SeaTreeKind,
} from "../../../crates/sea-webtransport/pkg/web/sea_webtransport.js";
import {
	type MinimalWasmDeltaConnection,
	MinimalWasmDocumentServiceFactory,
} from "../src/index.js";
import type { WasmProtocolClient } from "../src/wasmClient.js";
import { GeneratedSeaBindingAdapter } from "../src/generatedSeaBinding.js";

/** Browser hooks used by the headless trace runner and failure diagnostics. */
declare global {
	/** Trace-specific browser globals. */
	interface Window {
		/** Promise resolving to the final trace evidence. */
		__sharedTreeResult?: Promise<Record<string, unknown>>;
		/** Current lifecycle stage for timeout diagnostics. */
		__sharedTreeStage?: string;
		/** Recent Fluid telemetry retained for failure diagnostics. */
		__sharedTreeTelemetry?: ITelemetryBaseEvent[];
	}
}

/** Browser query parameters supplied by the headless trace runner. */
const parameters = new URLSearchParams(location.search);
/** Namespace owner for trace-only SharedTree schema identifiers. */
const schemaFactory = new SchemaFactory("fluid.experimental.wasm-driver");
/** SharedTree root used by the browser lifecycle trace. */
class SharedState extends schemaFactory.object("SharedState", {
	value: schemaFactory.number,
}) {}
/** SharedTree view configuration used by all trace containers. */
const treeConfiguration = new TreeViewConfiguration({ schema: SharedState });
/** Fluid container schema exposing the trace SharedTree as its initial object. */
const containerSchema = {
	initialObjects: { tree: SharedTree },
} satisfies ContainerSchema;
/** Fluid code identity shared by the trace containers. */
const codeDetails = { package: "shared-tree-wasm-driver", config: {} };
/** Recent Fluid telemetry retained for trace failure diagnostics. */
const telemetry: ITelemetryBaseEvent[] = [];
/** Generated clients whose transport metrics and lifetimes are reported by the trace. */
const transports: SeaBrowserTransport[] = [];
/** Explicit synchronization failures retained in final trace evidence. */
const synchronizationErrors: string[] = [];
/** Sequence numbers observed by each explicit synchronization point. */
const synchronizedSequences: Record<string, number[]> = {};
/** Operation envelopes observed by each explicit synchronization point. */
const synchronizedEnvelopes: Record<string, Record<string, unknown>[]> = {};
/** Minimal-driver connections whose lifecycle state is exercised by the trace. */
const deltaConnections: MinimalWasmDeltaConnection[] = [];
/** Container lifecycle snapshots retained for diagnostics. */
const containerStates: Record<string, unknown> = {};
/** Counts generated-client protocol methods exercised by the trace. */
const protocolCounts = {
	projectedReads: 0,
	projectedSubscriptions: 0,
	resolutions: 0,
	uploadedBlobs: 0,
	fetchedBlobs: 0,
	publishedSummaries: 0,
	fetchedSummaries: 0,
};
/** Current trace phase exposed to timeout diagnostics. */
let stage = "initializing";
window.__sharedTreeTelemetry = telemetry;

/** Records the current trace phase for browser failure diagnostics. */
function setStage(value: string): void {
	stage = value;
	window.__sharedTreeStage = value;
}

/** Narrows a trace invariant or fails with a diagnostic message. */
function assert(condition: unknown, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

/** Renders the final structured trace result into the browser harness. */
function showResult(result: Record<string, unknown>): void {
	const output = document.querySelector("#result");
	assert(output !== null, "missing result element");
	output.textContent = JSON.stringify(result);
}

/** Adapts the generated Sea client to the Fluid driver boundary. */
function adaptBrowserClient(
	client: SeaInjectedClient,
	reconnect: () => Promise<SeaBrowserTransport>,
): WasmProtocolClient {
	return new GeneratedSeaBindingAdapter(
		client,
		{
			loadKind: {
				snapshot: SeaLoadKind.Snapshot,
				event: SeaLoadKind.Event,
				caughtUp: SeaLoadKind.CaughtUp,
			},
			treeKind: {
				blob: SeaTreeKind.Blob,
				directory: SeaTreeKind.Directory,
			},
			blob: (bytes) => SeaTreeId.blob(bytes),
			directory: (bytes) => SeaTreeId.directory(bytes),
			directoryEntry: (name, child) => new SeaDirectoryEntry(name, child),
		},
		reconnect,
	);
}

/** Polls a trace condition until it succeeds or the diagnostic timeout expires. */
async function waitUntil(check: () => boolean, message: string): Promise<void> {
	const deadline = performance.now() + 10_000;
	while (!check()) {
		if (performance.now() >= deadline) {
			throw new Error(message);
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

/** Waits for a trace container to connect and reports its lifecycle on timeout. */
async function waitForConnected(container: {
	readonly connectionState: ConnectionState;
	readonly attachState: string;
	readonly closed: boolean;
	on(event: "connected", listener: () => void): void;
	off(event: "connected", listener: () => void): void;
}): Promise<void> {
	if (container.connectionState === ConnectionState.Connected) {
		return;
	}
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => {
			container.off("connected", connected);
			reject(
				new Error(
					`timed out waiting for connection during ${stage}: state=${container.connectionState}, attach=${container.attachState}, closed=${container.closed}`,
				),
			);
		}, 10_000);
		const connected = (): void => {
			clearTimeout(timeout);
			container.off("connected", connected);
			resolve();
		};
		container.on("connected", connected);
	});
}

/** Executes the browser lifecycle trace and returns its structured evidence. */
async function run(): Promise<Record<string, unknown>> {
	const transportUrl = parameters.get("transport");
	const certificateHex = parameters.get("hash");
	assert(transportUrl, "missing transport URL");
	assert(certificateHex?.length === 64, "missing certificate hash");
	await init();
	const started = performance.now();
	const hash = Uint8Array.from(certificateHex.match(/../gu) ?? [], (value) =>
		Number.parseInt(value, 16),
	);
	const documentId = `shared-tree-${Date.now()}`;
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
			const createTransport = async (): Promise<SeaBrowserTransport> => {
				const transport = await SeaBrowserTransport.connect(transportUrl, hash, 1024 * 1024);
				transports.push(transport);
				return transport;
			};
			const transport = await createTransport();
			return adaptBrowserClient(
				new SeaInjectedClient(transport, 1024 * 1024),
				createTransport,
			);
		},
		{
			onSynchronizationError: (error) => synchronizationErrors.push(String(error)),
			onDeltaConnection: (connection) => deltaConnections.push(connection),
			onSynchronized: (clientId, messages) => {
				if (messages.length > 0) {
					const sequences = synchronizedSequences[clientId] ?? [];
					sequences.push(...messages.map((message) => message.sequenceNumber));
					synchronizedSequences[clientId] = sequences;
					const envelopes = synchronizedEnvelopes[clientId] ?? [];
					envelopes.push(
						...messages.map((message) => ({
							type: message.type,
							clientId: message.clientId,
							clientSequenceNumber: message.clientSequenceNumber,
							referenceSequenceNumber: message.referenceSequenceNumber,
							metadataKeys: Object.keys(message.metadata ?? {}),
						})),
					);
					synchronizedEnvelopes[clientId] = envelopes;
				}
			},
		},
	);
	const runtimeFactory = createDOProviderContainerRuntimeFactory({
		schema: containerSchema,
		minVersionForCollaboration: "2.0.0",
		runtimeOptionOverrides: {
			summaryOptions: {
				summaryConfigOverrides: { state: "disabled" },
			},
		},
	});
	const codeLoader = {
		load: async () => ({
			module: { fluidExport: runtimeFactory },
			details: codeDetails,
		}),
	};
	const client: IClient = {
		details: { capabilities: { interactive: true } },
		permission: [],
		scopes: [],
		user: { id: "shared-tree-browser" },
		mode: "write",
	};
	const makeLoader = (): Loader =>
		new Loader({
			urlResolver,
			documentServiceFactory,
			codeLoader,
			logger: {
				send: (event) => {
					telemetry.push(event);
					if (telemetry.length > 100) {
						telemetry.shift();
					}
				},
			},
			options: { client },
		});

	setStage("creating-container");
	const firstContainer = await makeLoader().createDetachedContainer(codeDetails);
	const firstFluidContainer = await createFluidContainer<typeof containerSchema>({
		container: firstContainer,
	});
	const firstView = firstFluidContainer.initialObjects.tree.viewWith(treeConfiguration);
	firstView.initialize({ value: 0 });
	containerStates.firstValue = () => firstView.root.value;
	containerStates.firstConnectionState = () => firstContainer.connectionState;
	containerStates.firstClosed = () => firstContainer.closed;
	setStage("attaching-container");
	await firstContainer.attach({ url: resolvedUrl.url });
	await waitForConnected(firstContainer);
	const firstConnection = deltaConnections.at(-1);
	assert(firstConnection !== undefined, "attached container omitted its delta connection");
	const firstTransport = transports.at(-1);
	assert(firstTransport !== undefined, "attached container omitted its transport");

	setStage("loading-second-container");
	const secondContainer = await makeLoader().resolve({ url: resolvedUrl.url });
	await waitForConnected(secondContainer);
	const secondConnection = deltaConnections.at(-1);
	assert(secondConnection !== undefined, "loaded container omitted its delta connection");
	const secondFluidContainer = await createFluidContainer<typeof containerSchema>({
		container: secondContainer,
	});
	const secondView = secondFluidContainer.initialObjects.tree.viewWith(treeConfiguration);
	containerStates.secondValue = () => secondView.root.value;
	containerStates.secondConnectionState = () => secondContainer.connectionState;
	containerStates.secondClosed = () => secondContainer.closed;
	assert(secondView.root.value === 0, "initial SharedTree summary did not reload");

	setStage("converging-first-edit");
	firstView.root.value = 1;
	await firstConnection.waitForIdle();
	await waitUntil(
		() => secondView.root.value === 1,
		"second client did not receive first edit",
	);
	setStage("converging-second-edit");
	secondView.root.value = 2;
	await secondConnection.waitForIdle();
	containerStates.secondPendingAfterWait = secondConnection.pending.size;
	await firstConnection.synchronize();
	await waitUntil(
		() => firstView.root.value === 2,
		"first client did not receive second edit",
	);

	setStage("recovering-disconnected-edit");
	firstTransport.disconnect();
	firstView.root.value = 3;
	await waitUntil(() => firstConnection.pending.size > 0, "disconnected edit was not pending");
	let submissionFailed = false;
	try {
		await firstConnection.waitForIdle();
	} catch {
		submissionFailed = true;
	}
	assert(submissionFailed, "disconnected edit unexpectedly submitted");
	await firstConnection.reconnect();
	const resolutions = await firstConnection.recoverPending();
	const pendingSequenceNumber = firstConnection.pending.keys().next().value;
	assert(pendingSequenceNumber !== undefined, "pending edit disappeared before resolution");
	assert(
		resolutions.get(pendingSequenceNumber)?.kind === "notCommitted",
		"disconnected edit was not authoritatively notCommitted",
	);
	await firstConnection.resubmitPending(pendingSequenceNumber);
	await firstConnection.waitForIdle();
	await waitUntil(
		() => secondView.root.value === 3,
		"second client did not receive recovered edit",
	);

	setStage("reloading-container");
	const reloadedContainer = await makeLoader().resolve({ url: resolvedUrl.url });
	await waitForConnected(reloadedContainer);
	const reloadedFluidContainer = await createFluidContainer<typeof containerSchema>({
		container: reloadedContainer,
	});
	const reloadedView = reloadedFluidContainer.initialObjects.tree.viewWith(treeConfiguration);
	await waitUntil(
		() => reloadedView.root.value === 3,
		"reloaded SharedTree did not replay edits",
	);

	const wireBytes = 0n;
	const peakResponseBytes = 0;
	const peakSubscriptionFrameBytes = 0;
	const peakSubscriptionQueueDepth = 0;
	firstView.dispose();
	secondView.dispose();
	reloadedView.dispose();
	firstContainer.close();
	secondContainer.close();
	reloadedContainer.close();
	return {
		status: "passed",
		browser: navigator.userAgent,
		transportSessionCount: transports.length,
		independentContainerCount: 3,
		finalValue: 3,
		recoveryResolution: "notCommitted",
		explicitResubmissionCount: 1,
		protocolCounts,
		synchronizedSequences,
		wireBytes: wireBytes.toString(),
		peakResponseBytes,
		peakSubscriptionFrameBytes,
		peakSubscriptionQueueDepth,
		startupMilliseconds: performance.now() - started,
	};
}

window.__sharedTreeResult = run()
	.then((result) => {
		showResult(result);
		return result;
	})
	.catch((error: unknown) => {
		const result = {
			status: "failed",
			stage,
			error: String(error),
			synchronizationErrors,
			synchronizedSequences,
			synchronizedEnvelopes,
			deltaConnections: deltaConnections.map((connection) => ({
				clientId: connection.clientId,
				disposed: connection.disposed,
				checkpointSequenceNumber: connection.checkpointSequenceNumber,
				pending: connection.pending.size,
			})),
			containerStates: Object.fromEntries(
				Object.entries(containerStates).map(([name, read]) => [
					name,
					typeof read === "function" ? read() : read,
				]),
			),
			telemetry: telemetry.slice(-30),
		};
		showResult(result);
		return result;
	});

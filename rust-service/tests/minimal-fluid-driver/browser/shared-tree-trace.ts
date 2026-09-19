/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionState } from "@fluidframework/container-loader";
import { Loader } from "@fluidframework/container-loader/internal";
import type { IRequest, ITelemetryBaseEvent } from "@fluidframework/core-interfaces";
import type {
	FluidContainer,
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
import { defineTreeDataStore } from "@fluidframework/tree/internal";

import {
	createSeaFactories,
	openWebTransport,
	type SeaSession,
} from "@fluidframework/sea-typescript/internal";
import { type SeaDeltaConnection, SeaDriver } from "../src/index.js";
import {
	createSeaServiceClient,
	SeaSessionDriverClient,
} from "@fluidframework/sea-driver/internal";

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
/** Package-owned remote memberships opened by the trace's injected factory. */
const sessions: SeaSession[] = [];
/** Explicit synchronization failures retained in final trace evidence. */
const synchronizationErrors: string[] = [];
/** Sequence numbers observed by each explicit synchronization point. */
const synchronizedSequences: Record<string, number[]> = {};
/** Operation envelopes observed by each explicit synchronization point. */
const synchronizedEnvelopes: Record<string, Record<string, unknown>[]> = {};
/** Minimal-driver connections whose lifecycle state is exercised by the trace. */
const deltaConnections: SeaDeltaConnection[] = [];
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

/** Exercises the shared ServiceClient contract against real remote sessions. */
async function runServiceClient(
	url: string,
	certificateHash: Uint8Array,
): Promise<Record<string, unknown>> {
	const preset = parameters.get("preset") === "combined" ? "combined" : "split";
	const compression = parameters.get("compression") === "true";
	const factories = createSeaFactories({ preset, compressionSupport: compression });
	const containers: FluidContainer[] = [];
	const opened: SeaSession[] = [];
	const client = createSeaServiceClient({
		oldestSupportedClient: "2.20.0",
		openSession: async (document, options) => {
			const session = await factories.openWebTransport({ url, certificateHash }, document, {
				...options,
				compression,
			});
			opened.push(session);
			return session;
		},
	});
	const kind = defineTreeDataStore({
		type: "sea-service-client-browser",
		config: treeConfiguration,
		initializer: () => new SharedState({ value: 0 }),
	});
	try {
		setStage("service-client-detached");
		const detached = await client.createContainer(kind);
		containers.push(detached);
		assert(
			detached.id === undefined && opened.length === 0,
			"detached creation must not open SEA",
		);
		detached.data.root.value = 7;
		setStage("service-client-attach");
		const attached = await detached.attach();
		assert(
			attached === detached && attached.id.length > 0,
			"attachment must retain the container and assigned identity",
		);
		setStage("service-client-load");
		const peer = await client.loadContainer(attached.id, kind);
		containers.push(peer);
		assert(peer.data.root.value === 7, "initial ServiceClient summary must reload");
		attached.data.root.value = 11;
		await waitUntil(
			() => peer.data.root.value === 11,
			"ServiceClient peer did not receive an edit",
		);
		peer.data.root.value = 13;
		await waitUntil(
			() => attached.data.root.value === 13,
			"ServiceClient writer did not receive the peer edit",
		);
		attached.close();
		peer.close();
		setStage("service-client-reopen");
		const reopened = await client.loadContainer(attached.id, kind);
		containers.push(reopened);
		await waitUntil(
			() => reopened.data.root.value === 13,
			"closed ServiceClient document did not reopen",
		);
		const fresh = await client.createAttachedContainer(kind);
		containers.push(fresh);
		assert(
			fresh.id !== attached.id && fresh.data.root.value === 0,
			"attached creation must allocate independent documents",
		);
		return {
			status: "passed",
			browser: navigator.userAgent,
			environment: "Chromium inside Codespace",
			preset,
			compression,
			serviceClient: true,
			transport: "real WebTransport",
			transportSessionCount: opened.length,
			finalValue: 13,
		};
	} finally {
		for (const container of containers) container.close();
		await Promise.all(opened.map(async (session) => session.close()));
	}
}

/** Executes the browser lifecycle trace and returns its structured evidence. */
async function run(): Promise<Record<string, unknown>> {
	const transportUrl = parameters.get("transport");
	const certificateHex = parameters.get("hash");
	assert(transportUrl, "missing transport URL");
	assert(certificateHex?.length === 64, "missing certificate hash");
	const started = performance.now();
	const hash = Uint8Array.from(certificateHex.match(/../gu) ?? [], (value) =>
		Number.parseInt(value, 16),
	);
	if (parameters.get("serviceClient") === "true") {
		return runServiceClient(transportUrl, hash);
	}
	const documentId = `shared-tree-${Date.now()}`;
	let resolvedUrl: IResolvedUrl = {
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
	const documentServiceFactory = new SeaDriver(
		async () =>
			new SeaSessionDriverClient(async (document, options) => {
				const session = await openWebTransport(
					{ url: transportUrl, certificateHash: hash },
					document,
					options,
				);
				sessions.push(session);
				return session;
			}, "clientSelected"),
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
	if (firstContainer.resolvedUrl?.type !== "fluid") {
		throw new Error("attached container did not retain its assigned Fluid URL");
	}
	resolvedUrl = firstContainer.resolvedUrl;
	await waitForConnected(firstContainer);
	const firstConnection = deltaConnections.at(-1);
	assert(firstConnection !== undefined, "attached container omitted its delta connection");
	const firstSession = sessions.at(-1);
	assert(firstSession !== undefined, "attached container omitted its session");

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
	const submit = firstSession.submit.bind(firstSession);
	const submissionStarted = new Promise<void>((resolve) => {
		firstSession.submit = (...args) => {
			void firstSession.close().catch(() => {});
			resolve();
			return submit(...args);
		};
	});
	firstView.root.value = 3;
	await submissionStarted;
	assert(firstConnection.pending.size > 0, "disconnected edit was not pending");
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

	setStage("closing-containers");
	firstView.dispose();
	secondView.dispose();
	reloadedView.dispose();
	firstContainer.close();
	secondContainer.close();
	reloadedContainer.close();
	return {
		status: "passed",
		browser: navigator.userAgent,
		transportSessionCount: sessions.length,
		independentContainerCount: 3,
		finalValue: 3,
		recoveryResolution: "notCommitted",
		explicitResubmissionCount: 1,
		protocolCounts,
		synchronizedSequences,
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
			stack: error instanceof Error ? error.stack : undefined,
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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";

import {
	LoaderHeader,
	type IBatchMessage,
	type IContainer,
	type IContainerContext,
	type IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import {
	CompressionAlgorithms,
	ContainerMessageType,
} from "@fluidframework/container-runtime/internal";
import { Deferred } from "@fluidframework/core-utils/internal";
import {
	MessageType,
	type IDocumentMessage,
	type ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	createSummarizerCore,
	createTestConfigProvider,
	LoaderContainerTracker,
	LocalCodeLoader,
	summarizeNow,
	toIDeltaManagerFull,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import {
	codeDetails,
	createSeedSummary,
	projectionKey,
	readApplicationProjection,
} from "../externalSeedFile.js";
import { HtmlElement, HtmlText, viewHtmlParts } from "../htmlTreeSchema.js";
import {
	createLocalSeedBackend,
	type IInspectableStorageAdapter,
} from "../../harness/index.js";
import {
	sampleRuntimeFactory,
	type IAppObservation,
	type IHtmlEntryPoint,
} from "../sampleRuntimeFactory.js";
import {
	seedBaselineBlobName,
	seedBaselineMetadataKey,
	type SeedBaselineMismatchError,
} from "../seedBaselineFingerprint.js";
import { forward } from "../seedRuntimeAdapter.js";

const parts = { first: "<p>one</p>", second: "<p>two</p>" };
const largeText = Array.from({ length: 100 }, (_, i) =>
	createHash("sha256").update(String(i)).digest("hex"),
).join("");

/** Observe the actual loader-to-runtime boundary, never a direct test invocation of the adapter. */
interface ILoaderDispatch {
	/** Match delivery to the independently instantiated receiver. */
	readonly context: IContainerContext;
	/** Preserve the physical packet before native processing can unpack or mutate it. */
	readonly message: ISequencedDocumentMessage;
	readonly local: boolean;
	/** True only after validation and native processing returned successfully. */
	completed: boolean;
}

/** Emit an older writer's unpacked DDS envelope through the real service, never a direct process call. */
function unpackDataStoreMessage(
	message: IDocumentMessage,
	omitProof: boolean,
): IDocumentMessage {
	if (message.type !== MessageType.Operation) return message;
	const envelope: unknown =
		typeof message.contents === "string" ? JSON.parse(message.contents) : message.contents;
	if (
		typeof envelope !== "object" ||
		envelope === null ||
		!("type" in envelope) ||
		envelope.type !== ContainerMessageType.FluidDataStoreOp ||
		!("contents" in envelope)
	) {
		return message;
	}
	const sourceMetadata = message.metadata;
	assert(typeof sourceMetadata === "object" && sourceMetadata !== null);
	const metadata = { ...sourceMetadata };
	if (omitProof) Reflect.deleteProperty(metadata, seedBaselineMetadataKey);
	return {
		...message,
		type: envelope.type,
		contents:
			typeof message.contents === "string"
				? JSON.stringify(envelope.contents)
				: envelope.contents,
		metadata,
	};
}

/** Select a real shared text value; no native operations or DDS processing are mocked in these tests. */
function text(app: IHtmlEntryPoint, part: "first" | "second"): HtmlText {
	const element = app.view.root[part][0];
	assert(element instanceof HtmlElement);
	const node = element.children[0];
	assert(node instanceof HtmlText);
	return node;
}

/** Bound event waits so a missing mismatch/ACK cannot hang the test process. */
async function bounded<T>(promise: Promise<T>): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				timeout = setTimeout(
					() => reject(new Error("Timed out waiting for fingerprint test")),
					10_000,
				);
			}),
		]);
	} finally {
		clearTimeout(timeout);
	}
}

describe("Seed baseline fingerprint: real runtime transport", function () {
	this.timeout(60_000);
	let backend: IInspectableStorageAdapter;
	let tracker: LoaderContainerTracker;
	let containers: IContainer[];
	let observations: IAppObservation[];
	let writes: IBatchMessage[];
	let dispatches: ILoaderDispatch[];
	let failures: SeedBaselineMismatchError[];
	let tamper: ((batch: IBatchMessage[]) => IBatchMessage[]) | undefined;
	let transportOptions: Parameters<typeof sampleRuntimeFactory>[0];
	let frequentNoops: boolean;
	let legacyTransport: boolean;
	let accepted: Set<string>;
	let acceptedWaiters: Map<string, () => void>;

	beforeEach(() => {
		backend = createLocalSeedBackend();
		tracker = new LoaderContainerTracker(true);
		containers = [];
		observations = [];
		writes = [];
		dispatches = [];
		failures = [];
		tamper = undefined;
		transportOptions = {};
		frequentNoops = false;
		legacyTransport = false;
		accepted = new Set();
		acceptedWaiters = new Map();
	});
	afterEach(async () => {
		for (const container of containers) {
			if (!container.closed) container.close();
			container.dispose();
		}
		tracker.reset();
		await backend.close();
	});

	function loader(): Loader {
		const appFactory = sampleRuntimeFactory({
			...transportOptions,
			summaryOnRequest: true,
			observe: (observation) => {
				observations.push(observation);
			},
			onFingerprintMismatch: (failure) => {
				failures.push(failure);
			},
			onSummaryAccepted: (context) => {
				if (context.ackHandle !== undefined) {
					accepted.add(context.ackHandle);
					acceptedWaiters.get(context.ackHandle)?.();
					acceptedWaiters.delete(context.ackHandle);
				}
			},
		});
		const factory: IRuntimeFactory = {
			get IRuntimeFactory() {
				return this;
			},
			instantiateRuntime: async (context, existing) => {
				const observedContext = forward(context, {
					submitBatchFn: legacyTransport
						? undefined
						: (batch, sequenceNumber) => {
								// This sees actual final packets AFTER the fingerprint adapter and native transforms.
								writes.push(...structuredClone(batch));
								return context.submitBatchFn(tamper?.(batch) ?? batch, sequenceNumber);
							},
					submitFn: (type, contents, batch, appData) => {
						if (type === MessageType.Operation) {
							const metadata: unknown = appData;
							assert(
								metadata === undefined ||
									(typeof metadata === "object" &&
										metadata !== null &&
										!Array.isArray(metadata)),
							);
							writes.push({
								contents: JSON.stringify(contents),
								metadata:
									metadata === undefined ? undefined : structuredClone({ ...metadata }),
							});
						}
						return context.submitFn(type, contents, batch, appData);
					},
				});
				const runtime = await appFactory.instantiateRuntime(observedContext, existing);
				return forward(runtime, {
					// The current Loader calls IRuntime.process for every sequenced packet.
					// A dispatch-surface change must break these assertions, not bypass validation silently.
					process: (message, local) => {
						const dispatch: ILoaderDispatch = {
							context: observedContext,
							message: structuredClone(message),
							local,
							completed: false,
						};
						dispatches.push(dispatch);
						runtime.process(message, local);
						dispatch.completed = true;
					},
				});
			},
		};
		return new Loader({
			logger: new MockLogger(),
			documentServiceFactory: frequentNoops
				? forward(backend.documentServiceFactory, {
						createDocumentService: async (...args) => {
							const service = await backend.documentServiceFactory.createDocumentService(
								...args,
							);
							return forward(service, {
								connectToDeltaStream: async (...connectionArgs) => {
									const connection = await service.connectToDeltaStream(...connectionArgs);
									assert(connection.serviceConfiguration !== undefined);
									// Exercise the Loader's own noop heuristic through the actual service,
									// without submitting forbidden control messages through a runtime API.
									return forward(connection, {
										serviceConfiguration: {
											...connection.serviceConfiguration,
											noopTimeFrequency: 10,
											noopCountFrequency: 1,
										},
									});
								},
							});
						},
					})
				: backend.documentServiceFactory,
			urlResolver: backend.urlResolver,
			codeLoader: new LocalCodeLoader([[codeDetails, factory]]),
			configProvider: createTestConfigProvider({
				"Fluid.Container.UseLoadingGroupIdForSnapshotFetch2": true,
				"Fluid.Container.enableOfflineFull":
					transportOptions?.transportOptions?.enableGroupedBatching !== false,
			}),
		});
	}

	function track(container: IContainer): IContainer {
		containers.push(container);
		tracker.addContainer(container);
		return container;
	}

	async function open(
		url: string,
		pending?: string,
		version?: string,
	): Promise<{ container: IContainer; app: IHtmlEntryPoint; observation: IAppObservation }> {
		const container = track(
			await loader().resolve(
				{
					url,
					headers: version === undefined ? undefined : { [LoaderHeader.version]: version },
				},
				pending,
			),
		);
		await waitForContainerConnection(container);
		const app = (await container.getEntryPoint()) as IHtmlEntryPoint;
		const observation = observations.find((entry) => entry.app === app);
		assert(observation !== undefined);
		return { container, app, observation };
	}

	/** Await both service ACK and the application's coordinated native/GC acceptance callback. */
	async function acceptedSummary(container: IContainer): Promise<string> {
		const summarizer = await createSummarizerCore(container, loader());
		track(summarizer.container);
		await tracker.ensureSynchronized();
		const result = await summarizeNow(summarizer.summarizer);
		if (!accepted.has(result.summaryVersion)) {
			await bounded(
				new Promise<void>((resolve) => {
					acceptedWaiters.set(result.summaryVersion, resolve);
				}),
			);
		}
		return result.summaryVersion;
	}

	for (const mode of ["legacy", "ungrouped", "grouped", "compressed", "chunked"] as const) {
		it(`validates the first real edit and every later packet through ${mode} transport`, async () => {
			legacyTransport = mode === "legacy";
			transportOptions = {
				transportOptions: {
					enableGroupedBatching: mode !== "ungrouped" && mode !== "legacy",
					compressionOptions: {
						compressionAlgorithm: CompressionAlgorithms.lz4,
						minimumBatchSizeInBytes:
							mode === "compressed" || mode === "chunked" ? 0 : Infinity,
					},
					chunkSizeInBytes: mode === "chunked" ? 256 : Infinity,
				},
			};
			const url = await backend.create(createSeedSummary(parts));
			const a = await open(url);
			const b = await open(url);
			await tracker.ensureSynchronized();
			if (legacyTransport) {
				assert.equal(
					a.observation.context.submitBatchFn,
					undefined,
					"Do not advertise batch submission when the loader only provides submitFn",
				);
			}
			assert.equal(
				writes.length,
				0,
				"Opening a seed must not submit a handshake/init operation",
			);
			a.observation.runtime.orderSequentially(() => {
				text(a.app, "first").text = largeText;
				text(a.app, "second").text = "second edit in the batch";
			});
			await tracker.ensureSynchronized();
			assert.deepEqual(viewHtmlParts(a.app.view), viewHtmlParts(b.app.view));
			assert.equal(failures.length, 0);
			assert(writes.length > 0);
			for (const message of writes) {
				assert.deepEqual(message.metadata?.[seedBaselineMetadataKey], a.observation.baseline);
			}
			const received = dispatches.filter(
				(dispatch) =>
					dispatch.context === b.observation.original &&
					(dispatch.message.type === MessageType.Operation ||
						dispatch.message.type === ContainerMessageType.FluidDataStoreOp),
			);
			assert(
				received.length > 0,
				"Real Loader must dispatch operation packets through process",
			);
			for (const dispatch of received) {
				assert.equal(dispatch.local, false);
				assert.equal(dispatch.completed, true);
				assert.deepEqual(
					dispatch.message.metadata?.[seedBaselineMetadataKey],
					b.observation.baseline,
				);
			}
			switch (mode) {
				case "legacy":
				case "ungrouped": {
					assert(writes.some((message) => message.metadata?.batch === true));
					assert(writes.some((message) => message.metadata?.batch === false));
					break;
				}
				case "grouped": {
					assert(
						writes.some((message) => message.contents?.includes('"type":"groupedBatch"')),
					);
					assert(
						writes.some((message) => typeof message.metadata?.groupedOpCount === "number"),
					);
					break;
				}
				case "compressed": {
					assert(writes.some((message) => message.compression === "lz4"));
					break;
				}
				case "chunked": {
					assert(
						writes.filter((message) => message.contents?.includes('"type":"chunkedOp"'))
							.length > 1,
					);
					break;
				}
				default: {
					assert.fail("Unexpected transport mode");
				}
			}
			writes.length = 0;
			text(b.app, "first").text = "later edit";
			await tracker.ensureSynchronized();
			assert(writes.length > 0);
			assert(
				writes.every((message) => message.metadata?.[seedBaselineMetadataKey] !== undefined),
			);
			assert.equal(text(a.app, "first").text, "later edit");
		});
	}

	it("reconstructs proof for disconnected pending work and a fresh restored writer", async () => {
		const url = await backend.create(createSeedSummary(parts));
		const a = await open(url);
		const b = await open(url);
		await tracker.ensureSynchronized();
		const baseline = a.observation.baseline;
		a.container.disconnect();
		text(a.app, "first").text = "offline draft";
		assert(a.container.getPendingLocalState !== undefined);
		const pending = await a.container.getPendingLocalState();
		assert(pending !== undefined);
		assert(pending.includes('"baselineHash"'));
		assert.equal(
			writes.length,
			0,
			"Disconnected work must not submit a special proof operation",
		);
		a.container.close();
		a.container.dispose();
		const restored = await open(url, pending);
		await tracker.ensureSynchronized(b.container, restored.container);
		assert.equal(text(b.app, "first").text, "offline draft");
		assert.deepEqual(restored.observation.baseline, baseline);
		assert(writes.length > 0);
		assert(
			writes.every(
				(message) =>
					JSON.stringify(message.metadata?.[seedBaselineMetadataKey]) ===
					JSON.stringify(baseline),
			),
		);
	});

	it("restamps a disconnected batch when the same runtime reconnects and resubmits it", async () => {
		const url = await backend.create(createSeedSummary(parts));
		const a = await open(url);
		const b = await open(url);
		await tracker.ensureSynchronized();
		a.container.disconnect();
		text(a.app, "first").text = "same runtime pending edit";
		assert(a.container.getPendingLocalState !== undefined);
		await a.container.getPendingLocalState();
		assert.equal(writes.length, 0);
		a.container.connect();
		await waitForContainerConnection(a.container);
		await tracker.ensureSynchronized();
		assert.equal(text(b.app, "first").text, "same runtime pending edit");
		assert(writes.length > 0);
		for (const message of writes) {
			assert.deepEqual(message.metadata?.[seedBaselineMetadataKey], a.observation.baseline);
		}
		assert.equal(failures.length, 0);
	});

	for (const fault of ["descriptor", "raw", "unknown-envelope"] as const) {
		it(`rejects ${fault} pending agreement before native replay and retains the original pending work`, async () => {
			const url = await backend.create(createSeedSummary(parts));
			const a = await open(url);
			a.container.disconnect();
			text(a.app, "first").text = "retained offline draft";
			assert(a.container.getPendingLocalState !== undefined);
			const pending = await a.container.getPendingLocalState();
			assert(pending !== undefined);
			const saved: unknown = JSON.parse(pending);
			assert(typeof saved === "object" && saved !== null && "pendingRuntimeState" in saved);
			assert(
				typeof saved.pendingRuntimeState === "object" && saved.pendingRuntimeState !== null,
			);
			switch (fault) {
				case "descriptor": {
					Object.assign(saved.pendingRuntimeState, {
						baseline: { ...a.observation.baseline, baselineHash: "e".repeat(64) },
					});
					break;
				}
				case "raw": {
					assert("runtime" in saved.pendingRuntimeState);
					saved.pendingRuntimeState = saved.pendingRuntimeState.runtime;
					break;
				}
				case "unknown-envelope": {
					Object.assign(saved.pendingRuntimeState, { type: "unknown-pending/1" });
					break;
				}
				default: {
					assert.fail("Unexpected pending-state fault");
				}
			}
			a.container.close();
			a.container.dispose();
			const priorLoads = observations.length;
			await assert.rejects(
				loader().resolve({ url }, JSON.stringify(saved)),
				/fingerprint mismatch/,
			);
			assert.equal(
				observations.length,
				priorLoads,
				"Do not instantiate a native runtime with incompatible stashed ops",
			);
			assert(
				failures.some((failure) =>
					JSON.stringify(failure.pendingLocalState).includes("retained offline draft"),
				),
			);
		});
	}

	for (const fault of [
		"missing",
		"missing-native",
		"wrong-final-chunk",
		"wrong-last-batch-message",
	] as const) {
		it(`rejects ${fault} proof before native application and captures unsent local work`, async () => {
			const missingProof = fault === "missing" || fault === "missing-native";
			transportOptions = {
				transportOptions: {
					enableGroupedBatching: fault !== "wrong-last-batch-message",
					compressionOptions: {
						compressionAlgorithm: CompressionAlgorithms.lz4,
						minimumBatchSizeInBytes: fault === "wrong-final-chunk" ? 0 : Infinity,
					},
					chunkSizeInBytes: fault === "wrong-final-chunk" ? 256 : Infinity,
				},
			};
			const url = await backend.create(createSeedSummary(parts));
			const firstWriter = await open(url);
			let version: string | undefined;
			if (fault === "missing-native") {
				text(firstWriter.app, "first").text = "native checkpoint";
				version = await acceptedSummary(firstWriter.container);
				transportOptions = { ...transportOptions, allowProjection: false };
			}
			const a = version === undefined ? firstWriter : await open(url, undefined, version);
			const b = await open(url, undefined, version);
			await tracker.ensureSynchronized();
			const source = b.observation.original;
			assert(source.baseSnapshot !== undefined);
			const expectedSeed = b.observation.projected
				? await readApplicationProjection(
						source.baseSnapshot,
						source.storage.readBlob.bind(source.storage),
					)
				: undefined;
			// Already validated one genuine packet: later missing proof still fails.
			text(a.app, "first").text = "valid edit";
			await tracker.ensureSynchronized();
			const before = text(b.app, "first").text;
			await toIDeltaManagerFull(b.container.deltaManager).outbound.pause();
			text(b.app, "second").text = "unsent local draft";
			const closed = new Promise<void>((resolve) =>
				b.container.once("closed", () => resolve()),
			);
			tamper = (batch) =>
				batch.map((message) => {
					if (fault === "wrong-last-batch-message" && message.metadata?.batch !== false) {
						return message;
					}
					if (fault === "wrong-final-chunk") {
						const envelope: unknown = JSON.parse(message.contents ?? "{}");
						if (
							typeof envelope !== "object" ||
							envelope === null ||
							!("contents" in envelope) ||
							typeof envelope.contents !== "object" ||
							envelope.contents === null ||
							!("chunkId" in envelope.contents) ||
							!("totalChunks" in envelope.contents) ||
							envelope.contents.chunkId !== envelope.contents.totalChunks
						)
							return message;
					}
					const metadata = { ...message.metadata };
					if (missingProof) {
						Reflect.deleteProperty(metadata, seedBaselineMetadataKey);
					} else {
						metadata[seedBaselineMetadataKey] = {
							...a.observation.baseline,
							baselineHash: "f".repeat(64),
						};
					}
					return { ...message, metadata };
				});
			a.observation.runtime.orderSequentially(() => {
				text(a.app, "first").text = largeText;
				text(a.app, "second").text = "another edit in the rejected batch";
			});
			await bounded(closed);
			// Ungrouped native batches apply individually validated packets incrementally.
			// The earlier valid first-part op is not rolled back; the invalid second-part op
			// must not overwrite the local draft. Grouped/chunked payloads have not applied at all.
			assert.equal(
				text(b.app, "first").text,
				fault === "wrong-last-batch-message" ? largeText : before,
				"Only individually validated native operations may apply",
			);
			assert.equal(text(b.app, "second").text, "unsent local draft");
			const failure = failures.find((entry) =>
				JSON.stringify(entry.pendingLocalState).includes("unsent local draft"),
			);
			assert(
				failure !== undefined,
				"Capture native pending work before closing the container",
			);
			assert.equal(failure.pendingCaptureError, undefined);
			assert(
				!JSON.stringify(failure.getTelemetryProperties()).includes("unsent local draft"),
				"Diagnostic telemetry must not contain captured pending user content",
			);
			assert.deepEqual(failure.expected, b.observation.baseline);
			assert(failure.packet !== undefined);
			const rejectedSequenceNumber = failure.packet.sequenceNumber;
			assert(
				dispatches.some(
					(dispatch) =>
						dispatch.context === source &&
						dispatch.message.sequenceNumber === rejectedSequenceNumber &&
						!dispatch.local &&
						!dispatch.completed,
				),
				"The real Loader's receiving-runtime dispatch must reject this packet",
			);
			const recovery = failure.pendingLocalState;
			assert(typeof recovery === "object" && recovery !== null);
			assert("loadedFrom" in recovery && "baseline" in recovery && "seed" in recovery);
			assert.equal(typeof source.getLoadedFromVersion()?.id, "string");
			assert.deepEqual(recovery.loadedFrom, {
				version: source.getLoadedFromVersion()?.id,
				sequenceNumber: source.deltaManager.initialSequenceNumber,
			});
			assert.deepEqual(recovery.baseline, b.observation.baseline);
			assert.deepEqual(recovery.seed, expectedSeed);
			if (b.observation.projected) {
				assert("provenance" in recovery);
				assert.deepEqual(recovery.provenance, b.observation.provenance);
			} else {
				assert.equal(b.observation.projected, false);
				assert("retainedBaseline" in recovery);
				assert.deepEqual(recovery.retainedBaseline, {
					blobId: source.baseSnapshot.trees[projectionKey]?.blobs[seedBaselineBlobName],
					descriptor: b.observation.baseline,
				});
			}
			if (missingProof) assert.equal(failure.received, undefined);
			else assert(JSON.stringify(failure.received).includes("f".repeat(64)));
		});
	}

	it("rejects a proofless unpacked DDS envelope delivered by the real service before native dispatch", async () => {
		transportOptions = {
			transportOptions: {
				enableGroupedBatching: false,
				compressionOptions: {
					compressionAlgorithm: CompressionAlgorithms.lz4,
					minimumBatchSizeInBytes: Infinity,
				},
			},
		};
		const url = await backend.create(createSeedSummary(parts));
		const a = await open(url);
		const b = await open(url);
		text(a.app, "first").text = "a genuine native edit";
		await tracker.ensureSynchronized();
		const nativePacket = writes.find((message) =>
			message.contents?.includes('"type":"component"'),
		);
		assert(nativePacket?.contents !== undefined);
		await toIDeltaManagerFull(b.container.deltaManager).outbound.pause();
		text(b.app, "second").text = "unpacked receiver draft";

		assert(a.container.resolvedUrl !== undefined);
		const service = await backend.documentServiceFactory.createDocumentService(
			a.container.resolvedUrl,
		);
		try {
			// A separate older writer sends a standalone envelope, not a modern batch containing
			// mixed packed/unpacked members (which the native inbound batch tracker rejects earlier).
			const connection = await service.connectToDeltaStream({
				mode: "write",
				details: a.observation.original.clientDetails,
				permission: [],
				user: { id: "legacy-fingerprint-writer" },
				scopes: ["doc:read", "doc:write"],
			});
			const closed = new Deferred<void>();
			const onClosed = (): void => closed.resolve();
			const onError = (error: unknown): void => closed.reject(error);
			b.container.once("closed", onClosed);
			connection.on("error", onError);
			try {
				const packet = unpackDataStoreMessage(
					{
						type: MessageType.Operation,
						contents: nativePacket.contents,
						clientSequenceNumber: 1,
						referenceSequenceNumber: b.container.deltaManager.lastSequenceNumber,
						metadata: { [seedBaselineMetadataKey]: b.observation.baseline },
					},
					true,
				);
				assert.equal(packet.type, ContainerMessageType.FluidDataStoreOp);
				connection.submit([packet]);
				await bounded(closed.promise);
				const failure = failures.find(
					(entry) =>
						entry.packet?.clientId === connection.clientId &&
						JSON.stringify(entry.pendingLocalState).includes("unpacked receiver draft"),
				);
				assert(failure !== undefined);
				assert.equal(failure.received, undefined);
				assert.equal(failure.packet?.type, ContainerMessageType.FluidDataStoreOp);
				assert.equal(failure.pendingCaptureError, undefined);
				assert.equal(text(b.app, "second").text, "unpacked receiver draft");
				assert(
					dispatches.some(
						(dispatch) =>
							dispatch.context === b.observation.original &&
							dispatch.message.clientId === connection.clientId &&
							dispatch.message.type === ContainerMessageType.FluidDataStoreOp &&
							!dispatch.completed,
					),
					"The actual Loader must dispatch and reject the proofless legacy envelope",
				);
			} finally {
				b.container.off("closed", onClosed);
				connection.off("error", onError);
				connection.dispose();
			}
		} finally {
			service.dispose();
		}
	});

	it("persists genesis proof outside DDS state and reloads it without recomputing edited genesis", async () => {
		const url = await backend.create(createSeedSummary(parts));
		const a = await open(url);
		text(a.app, "first").text = "changed before summary";
		await tracker.ensureSynchronized();
		const version = await acceptedSummary(a.container);
		const inspection = await backend.inspect(url, version);
		try {
			const descriptorId =
				inspection.snapshot.snapshotTree.trees[projectionKey]?.blobs[seedBaselineBlobName];
			assert(descriptorId !== undefined);
			const stored: unknown = JSON.parse(
				Buffer.from(await inspection.readBlob(descriptorId)).toString(),
			);
			assert.deepEqual(stored, a.observation.baseline);
		} finally {
			inspection.dispose();
		}
		transportOptions = { allowProjection: false };
		const native = await open(url, undefined, version);
		assert.equal(native.observation.projected, false);
		assert.deepEqual(native.observation.baseline, a.observation.baseline);
		text(native.app, "second").text = "native writer";
		await tracker.ensureSynchronized();
		assert.equal(text(a.app, "second").text, "native writer");
		const nextVersion = await acceptedSummary(native.container);
		const reloadedNative = await open(url, undefined, nextVersion);
		assert.equal(reloadedNative.observation.projected, false);
		assert.deepEqual(reloadedNative.observation.baseline, a.observation.baseline);
		assert.equal(text(reloadedNative.app, "second").text, "native writer");
		assert.equal(failures.length, 0);
	});

	it("allows untagged service join, SummaryAck, and noop through the actual loader dispatch", async () => {
		frequentNoops = true;
		const url = await backend.create(createSeedSummary(parts));
		const a = await open(url);
		const receivedNoop = new Deferred<void>();
		const observeNoop = (message: ISequencedDocumentMessage): void => {
			if (message.type === MessageType.NoOp) receivedNoop.resolve();
		};
		a.container.on("op", observeNoop);
		try {
			text(a.app, "first").text = "writer establishes a real service connection";
			await tracker.ensureSynchronized();
			await acceptedSummary(a.container);
			await bounded(receivedNoop.promise);
		} finally {
			a.container.off("op", observeNoop);
		}
		for (const type of [MessageType.ClientJoin, MessageType.SummaryAck, MessageType.NoOp]) {
			const deliveries = dispatches.filter(
				(dispatch) =>
					dispatch.context === a.observation.original && dispatch.message.type === type,
			);
			assert(deliveries.length > 0, `Real Loader must deliver ${type} to IRuntime.process`);
			for (const delivery of deliveries) {
				assert.equal(delivery.message.metadata?.[seedBaselineMetadataKey], undefined);
				assert.equal(delivery.completed, true);
			}
		}
		assert.equal(failures.length, 0);
		assert.equal(a.container.closed, false);
	});
});

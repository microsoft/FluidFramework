/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { enableOnNewFileKey, getRuntimeAttributor } from "@fluid-experimental/attributor";
import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { finishLoggingReport, ValueType, type Measurement } from "@fluid-tools/benchmark";
import { LoaderHeader, type IContainer } from "@fluidframework/container-definitions/internal";
import { loadContainerAfterNativeCheckpointRestore } from "@fluidframework/container-loader/internal";
import {
	NativeCheckpointCoordinator,
	neverCancelledSummaryToken,
	type ContainerRuntime as ContainerRuntimeType,
	type IGCRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { Deferred } from "@fluidframework/core-utils/internal";
import {
	DriverHeader,
	MessageType,
	SummaryType,
} from "@fluidframework/driver-definitions/internal";
import type { SharedString } from "@fluidframework/sequence/internal";
import type { SharedMatrix } from "@fluidframework/matrix/internal";
import { createInsertOnlyAttributionPolicy } from "@fluidframework/merge-tree/internal";
import type { AttributionInfo } from "@fluidframework/runtime-definitions/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import { spy, stub, useFakeTimers } from "sinon";
import {
	createSummarizer,
	createTestConfigProvider,
	DataObjectFactoryType,
	LoaderContainerTracker,
	summarizeNow,
	timeoutAwait,
	waitForContainerConnection,
	type ITestContainerConfig,
	TestFluidObject,
} from "@fluidframework/test-utils/internal";

import {
	getGCDeletedStateFromSummary,
	getGCStateFromSummary,
	// eslint-disable-next-line import-x/no-internal-modules -- Reuse the GC suite's summary decoders in this lifecycle test.
} from "../gc/gcTestSummaryUtils.js";

/** Creates reproducible, poorly compressible bytes without a live randomness source. */
function createRandomBytes(length: number, seed: number): Uint8Array<ArrayBuffer> {
	let state = seed;
	return Uint8Array.from({ length }, () => {
		state = (state * 1664525 + 1013904223) % 4294967296;
		return Math.floor(state / 16777216);
	});
}

/** Narrows the test entry point to its actual data object. */
async function getEntry(container: IContainer): Promise<TestFluidObject> {
	const entry = await container.getEntryPoint();
	assert(entry instanceof TestFluidObject);
	return entry;
}

describeCompat("Native checkpoints", "NoCompat", (getTestObjectProvider, apis) => {
	const { ContainerRuntime } = apis.containerRuntime;
	const { Loader } = apis.loader;
	const { SharedMatrix } = apis.dds;
	const { configuredSharedString } = apis.dataRuntime.packages.sequence;
	/** Gets the concrete runtime without depending on private container fields. */
	async function getRuntime(container: IContainer): Promise<ContainerRuntimeType> {
		const entry = await getEntry(container);
		const runtime = entry.context.containerRuntime;
		assert(runtime instanceof ContainerRuntime);
		return runtime;
	}
	const configProvider = createTestConfigProvider({
		"Fluid.ContainerRuntime.NativeCheckpoints": true,
	});
	const config: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		loaderProps: { configProvider },
		runtimeOptions: {
			summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
		},
		registry: [
			["text", configuredSharedString({ newMergeTreeSnapshotFormat: true }).getFactory()],
			["table", SharedMatrix.getFactory()],
		],
	};

	it("does not enable existing files when the creation gate is turned on", async () => {
		const provider = getTestObjectProvider();
		const source = await provider.makeTestContainer({
			...config,
			loaderProps: { configProvider: createTestConfigProvider({}) },
		});
		await waitForContainerConnection(source);
		const reopened = await provider.loadTestContainer(config);
		await waitForContainerConnection(reopened);
		const runtime = await getRuntime(reopened);
		assert.deepEqual(runtime.getNativeCheckpoints(), []);
		await assert.rejects(runtime.createNativeCheckpoint("not-enabled"), /unavailable/);
	});

	it("rejects capture with unacknowledged edits instead of archiving optimistic state", async () => {
		const provider = getTestObjectProvider();
		const source = await provider.makeTestContainer(config);
		await waitForContainerConnection(source);
		const entry = await getEntry(source);
		const runtime = await getRuntime(source);
		await provider.ensureSynchronized();
		entry.root.set("pending", "local edit");
		await assert.rejects(runtime.createNativeCheckpoint("pending"), /acknowledged/);
		assert.deepEqual(runtime.getNativeCheckpoints(), []);
	});

	it("coordinates acknowledged capture and retention without leaking runtime listeners", async () => {
		const provider = getTestObjectProvider();
		const source = await provider.makeTestContainer(config);
		await waitForContainerConnection(source);
		const runtime = await getRuntime(source);
		await provider.ensureSynchronized();
		provider.opProcessingController.resumeProcessing();
		const originalListeners = runtime.listenerCount("op");
		const coordinator = new NativeCheckpointCoordinator(runtime);
		try {
			const checkpoint = await coordinator.capture("coordinated");
			assert(
				checkpoint.timestamp !== undefined && checkpoint.storeSequenceNumber !== undefined,
			);
			const firstSummary = await runtime.loadNativeCheckpointSummary(checkpoint.id);
			const secondSummary = await runtime.loadNativeCheckpointSummary(checkpoint.id);
			firstSummary.tree["caller-mutation"] = { type: SummaryType.Blob, content: "local" };
			assert.deepEqual(
				await runtime.loadNativeCheckpointSummary(checkpoint.id),
				secondSummary,
			);
			assert.equal((await coordinator.prune({ minAgeMs: 0, targetCount: 0 })).length, 0);
			await assert.rejects(runtime.loadNativeCheckpointSummary(checkpoint.id), /Unknown/);
		} finally {
			coordinator.dispose();
		}
		assert.equal(runtime.listenerCount("op"), originalListeners);
		await assert.rejects(coordinator.capture("disposed"), /live connected/);
	});

	itExpects(
		"keeps the restored snapshot latest when an older ordinary upload finishes afterward",
		[
			{
				eventName: "fluid:telemetry:Container:ContainerDispose",
				error: "Native checkpoint restored: reload without cached or pending state",
			},
			{
				eventName: "fluid:telemetry:Container:ContainerDispose",
				error: "Native checkpoint restored: reload without cached or pending state",
			},
			{
				eventName: "fluid:telemetry:Container:ContainerClose",
				error: "Native checkpoint restored: reload without cached or pending state",
			},
		],
		async () => {
			const provider = getTestObjectProvider({ syncSummarizer: true });
			const source = await provider.makeTestContainer(config);
			await waitForContainerConnection(source);
			const entry = await getEntry(source);
			entry.root.set("value", "checkpoint");
			await provider.ensureSynchronized();
			provider.opProcessingController.resumeProcessing();
			const requester = new NativeCheckpointCoordinator(await getRuntime(source));
			await requester.capture("before-race");
			entry.root.set("value", "ordinary must not win");
			await provider.ensureSynchronized();
			const workers = await Promise.all(
				[0, 1].map(async () =>
					provider.loadTestContainer(config, {
						[LoaderHeader.clientDetails]: {
							capabilities: { interactive: false },
							type: "summarizer",
						},
						[DriverHeader.summarizingClient]: true,
					}),
				),
			);
			await Promise.all(workers.map(async (worker) => waitForContainerConnection(worker)));
			const [ordinary, restorer] = await Promise.all(
				workers.map(async (worker) => getRuntime(worker)),
			);
			assert(ordinary !== undefined && restorer !== undefined);
			await provider.ensureSynchronized();
			provider.opProcessingController.resumeProcessing();
			const uploadStarted = new Deferred<void>();
			const releaseUpload = new Deferred<void>();
			const originalUpload = ordinary.storage.uploadSummaryWithContext.bind(ordinary.storage);
			const delayed = stub(ordinary.storage, "uploadSummaryWithContext").callsFake(
				async (...args) => {
					uploadStarted.resolve();
					await releaseUpload.promise;
					return originalUpload(...args);
				},
			);
			const ordinaryDisposed = new Deferred<void>();
			const restorerDisposed = new Deferred<void>();
			const restorerOrdered = new Deferred<void>();
			const onRestoreOp = (): void => {
				if (restorer.getNativeCheckpointRestore()?.restore.id === "winning-restore") {
					restorerOrdered.resolve();
				}
			};
			restorer.on("op", onRestoreOp);
			ordinary.once("dispose", () => ordinaryDisposed.resolve());
			restorer.once("dispose", () => restorerDisposed.resolve());
			const ordinaryResult = ordinary.submitSummary({
				fullTree: true,
				summaryLogger: createChildLogger({ logger: provider.logger }),
				cancellationToken: neverCancelledSummaryToken,
				latestSummaryRefSeqNum: 0,
			});
			try {
				await timeoutAwait(uploadStarted.promise, {
					errorMsg: "Ordinary upload did not start",
				});
				await requester.requestRestore("winning-restore", "before-race");
				await timeoutAwait(restorerOrdered.promise, {
					errorMsg: "Restorer did not observe the ordered boundary",
				});
				await provider.opProcessingController.pauseProcessing(source);
				await restorer.publishNativeCheckpointRestore();
				await restorerDisposed.promise;
				releaseUpload.resolve();
				await ordinaryResult;
				await ordinaryDisposed.promise;
				provider.opProcessingController.resumeProcessing(source);
				await provider.ensureSynchronized();
				const latest = await provider.loadTestContainer(config, {
					[LoaderHeader.cache]: false,
				});
				assert.equal((await getEntry(latest)).root.get("value"), "checkpoint");
				assert.equal(
					(await getRuntime(latest)).getNativeCheckpointRestore()?.restore.id,
					"winning-restore",
				);
			} finally {
				releaseUpload.resolve();
				await ordinaryResult;
				restorer.off("op", onRestoreOp);
				delayed.restore();
				requester.dispose();
			}
		},
	);

	it("rejects the losing capture when two clients reuse a checkpoint ID", async () => {
		const provider = getTestObjectProvider();
		const source = await provider.makeTestContainer(config);
		const peer = await provider.loadTestContainer(config);
		await Promise.all(
			[source, peer].map(async (container) => waitForContainerConnection(container)),
		);
		await provider.ensureSynchronized();
		provider.opProcessingController.resumeProcessing();
		const coordinators = await Promise.all(
			[source, peer].map(
				async (container) => new NativeCheckpointCoordinator(await getRuntime(container)),
			),
		);
		try {
			const results = await Promise.allSettled(
				coordinators.map(async (coordinator) => coordinator.capture("same-id")),
			);
			assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
			assert.equal(results.filter((result) => result.status === "rejected").length, 1);
		} finally {
			for (const coordinator of coordinators) {
				coordinator.dispose();
			}
		}
	});

	it("bounds acknowledgement waits and cancels them on coordinator disposal", async () => {
		const provider = getTestObjectProvider();
		const source = await provider.makeTestContainer(config);
		await waitForContainerConnection(source);
		const runtime = await getRuntime(source);
		await provider.ensureSynchronized();
		provider.opProcessingController.resumeProcessing();
		const seedCoordinator = new NativeCheckpointCoordinator(runtime);
		const checkpoint = await seedCoordinator.capture("seed");
		seedCoordinator.dispose();
		const coordinator = new NativeCheckpointCoordinator(runtime, { ackTimeoutMs: 100 });
		const createStub = stub(runtime, "createNativeCheckpoint").resolves(checkpoint);
		const clock = useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			const timedOut = assert.rejects(coordinator.capture("timeout"), /timed out/);
			await clock.tickAsync(100);
			await timedOut;
			const cancelled = assert.rejects(coordinator.capture("cancelled"), /interrupted/);
			await assert.rejects(coordinator.prune(), /already has a catalog operation/);
			coordinator.dispose();
			await cancelled;
			assert.equal(clock.countTimers(), 0);
		} finally {
			coordinator.dispose();
			clock.restore();
			createStub.restore();
		}
	});

	it("reports the winner of concurrent distinct restore requests", async () => {
		const provider = getTestObjectProvider();
		const source = await provider.makeTestContainer(config);
		const peer = await provider.loadTestContainer(config);
		await Promise.all(
			[source, peer].map(async (container) => waitForContainerConnection(container)),
		);
		await provider.ensureSynchronized();
		provider.opProcessingController.resumeProcessing();
		const first = new NativeCheckpointCoordinator(await getRuntime(source));
		const second = new NativeCheckpointCoordinator(await getRuntime(peer));
		try {
			await first.capture("first-point");
			(await getEntry(peer)).root.set("writer", true);
			await provider.ensureSynchronized();
			provider.opProcessingController.resumeProcessing();
			const results = await Promise.allSettled([
				first.requestRestore("first-request", "first-point"),
				second.requestRestore("second-request", "first-point"),
			]);
			assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
			const rejected = results.find((result) => result.status === "rejected");
			assert(rejected?.status === "rejected");
			assert.match(String(rejected.reason), /different native checkpoint restore won/);
		} finally {
			first.dispose();
			second.dispose();
		}
	});

	itExpects(
		"recovers a transient coordinated upload failure and rejects offline pending edits",
		[
			{
				eventName: "fluid:telemetry:Container:ContainerClose",
				error: "Cannot replay pending edits across a native checkpoint restore",
			},
			{
				eventName: "fluid:telemetry:Container:ContainerDispose",
				error: "Native checkpoint restored: reload without cached or pending state",
			},
			{
				eventName: "fluid:telemetry:Container:ContainerClose",
				error: "Native checkpoint restored: reload without cached or pending state",
			},
		],
		async () => {
			const provider = getTestObjectProvider({ syncSummarizer: true });
			const source = await provider.makeTestContainer(config);
			await waitForContainerConnection(source);
			const runtime = await getRuntime(source);
			const entry = await getEntry(source);
			entry.root.set("value", "checkpoint");
			await provider.ensureSynchronized();
			provider.opProcessingController.resumeProcessing();
			const requester = new NativeCheckpointCoordinator(runtime);
			await requester.capture("recoverable");
			const peer = await provider.loadTestContainer(config);
			await waitForContainerConnection(peer);
			await provider.ensureSynchronized();
			peer.disconnect();
			(await getEntry(peer)).root.set("offline", "must not replay");
			entry.root.set("value", "later");
			await provider.ensureSynchronized(source);
			const worker = await provider.loadTestContainer(config, {
				[LoaderHeader.clientDetails]: {
					capabilities: { interactive: false },
					type: "summarizer",
				},
				[DriverHeader.summarizingClient]: true,
			});
			await waitForContainerConnection(worker);
			const workerRuntime = await getRuntime(worker);
			const failed = new Deferred<unknown>();
			const upload = stub(workerRuntime.storage, "uploadSummaryWithContext").callThrough();
			upload.onFirstCall().rejects(new Error("Injected transient checkpoint upload failure"));
			const publisher = new NativeCheckpointCoordinator(workerRuntime, {
				publishRestores: true,
				onPublicationError: (error) => failed.resolve(error),
			});
			try {
				provider.opProcessingController.resumeProcessing();
				await requester.requestRestore("retry-restore", "recoverable");
				assert.match(String(await failed.promise), /Injected transient/);
				assert.equal(
					upload.callCount,
					1,
					"Do not retry failed storage requests in an unbounded loop",
				);
				const peerClosed = new Deferred<void>();
				peer.once("closed", () => peerClosed.resolve());
				peer.connect();
				await timeoutAwait(peerClosed.promise, {
					errorMsg: "Offline client replayed old edits",
				});
				await provider.opProcessingController.pauseProcessing(source);
				const workerDisposed = new Deferred<void>();
				workerRuntime.once("dispose", () => workerDisposed.resolve());
				const versions = await Promise.all([
					publisher.publishRestore(),
					publisher.publishRestore(),
				]);
				await workerDisposed.promise;
				assert.equal(versions[0], versions[1]);
				assert.equal(upload.callCount, 2, "Concurrent callers share the retry attempt");
				provider.opProcessingController.resumeProcessing(source);
				await provider.ensureSynchronized();
				const restored = await provider.loadTestContainer(config, {
					[LoaderHeader.version]: versions[0],
				});
				const restoredEntry = await getEntry(restored);
				assert.equal(restoredEntry.root.get("value"), "checkpoint");
				assert.equal(restoredEntry.root.get("offline"), undefined);
			} finally {
				requester.dispose();
				publisher.dispose();
				upload.restore();
			}
		},
	);

	it("sequences retention and releases only removed checkpoint and image GC roots", async () => {
		const provider = getTestObjectProvider({ syncSummarizer: true });
		const source = await provider.makeTestContainer(config);
		await waitForContainerConnection(source);
		const entry = await getEntry(source);
		const runtime = await getRuntime(source);
		const image = await runtime.uploadBlob(new Uint8Array(4096).fill(91).buffer);
		entry.root.set("image", image);
		await provider.ensureSynchronized();
		const first = await runtime.createNativeCheckpoint("first");
		await provider.ensureSynchronized();
		entry.root.delete("image");
		await provider.ensureSynchronized();
		for (let index = 0; index < 6; index++) {
			entry.root.set("value", index);
			await provider.ensureSynchronized();
			await runtime.createNativeCheckpoint(`point-${index}`);
			await provider.ensureSynchronized();
		}
		const all = runtime.getNativeCheckpoints();
		runtime.retainNativeCheckpoints(["point-5"]);
		await provider.ensureSynchronized();
		const retained = runtime.getNativeCheckpoints();
		assert(retained.length < all.length);
		const gcData = await runtime.getGCData(true);
		for (const checkpoint of all) {
			assert.equal(
				gcData.gcNodes["/"].includes(checkpoint.route),
				retained.some((candidate) => candidate.id === checkpoint.id),
			);
		}
		assert.equal(
			gcData.gcNodes["/"].includes(first.assets[0]),
			retained.some((checkpoint) => checkpoint.assets.includes(first.assets[0])),
		);
		const { summarizer } = await createSummarizer(provider, source, {
			...config,
			runtimeOptions: undefined,
		});
		const { summaryVersion } = await summarizeNow(summarizer);
		const peer = await provider.loadTestContainer(config, {
			[LoaderHeader.version]: summaryVersion,
		});
		await waitForContainerConnection(peer);
		const peerRuntime = await getRuntime(peer);
		assert.deepEqual(peerRuntime.getNativeCheckpoints(), retained);
		runtime.retainNativeCheckpoints([]);
		await provider.ensureSynchronized();
		assert.deepEqual(peerRuntime.getNativeCheckpoints(), []);
		const emptyGCData = await runtime.getGCData(true);
		assert(!emptyGCData.gcNodes["/"].includes(first.assets[0]));
		for (const checkpoint of all) {
			assert(!emptyGCData.gcNodes["/"].includes(checkpoint.route));
		}
	});

	it("timestamps acknowledged captures and fences stale policy pruning from racing captures", async () => {
		const provider = getTestObjectProvider();
		const source = await provider.makeTestContainer(config);
		const peer = await provider.loadTestContainer(config);
		await Promise.all(
			[source, peer].map(async (container) => waitForContainerConnection(container)),
		);
		const runtime = await getRuntime(source);
		const peerRuntime = await getRuntime(peer);
		const timestamps = new Map<number, number>();
		const racingAcknowledged = new Deferred<void>();
		const onOp = (
			message: import("@fluidframework/driver-definitions/internal").ISequencedDocumentMessage,
		): void => {
			timestamps.set(message.sequenceNumber, message.timestamp);
			if (runtime.getNativeCheckpoints().some((checkpoint) => checkpoint.id === "racing")) {
				racingAcknowledged.resolve();
			}
		};
		source.on("op", onOp);
		try {
			await provider.ensureSynchronized();
			const submitted = await runtime.createNativeCheckpoint("first");
			assert.equal(
				submitted.timestamp,
				undefined,
				"Unacknowledged capture has no service time",
			);
			await provider.ensureSynchronized();
			const first = runtime.getNativeCheckpoints()[0];
			assert(first.storeSequenceNumber !== undefined && first.timestamp !== undefined);
			assert.equal(first.timestamp, timestamps.get(first.storeSequenceNumber));
			assert.deepEqual(peerRuntime.getNativeCheckpoints(), runtime.getNativeCheckpoints());

			// Plan on the peer, but hold its outbound request while another capture wins sequencing.
			await provider.opProcessingController.pauseProcessing(peer);
			const plannedAt = peer.deltaManager.lastSequenceNumber;
			peerRuntime.pruneNativeCheckpoints({ minAgeMs: 0, targetCount: 0 });
			await runtime.createNativeCheckpoint("racing");
			provider.opProcessingController.resumeProcessing(source);
			await timeoutAwait(racingAcknowledged.promise, {
				errorMsg: "Racing capture was not acknowledged",
			});
			const racing = runtime
				.getNativeCheckpoints()
				.find((checkpoint) => checkpoint.id === "racing");
			assert(
				racing?.storeSequenceNumber !== undefined && racing.storeSequenceNumber > plannedAt,
			);
			await provider.opProcessingController.processOutgoing(peer);
			await provider.ensureSynchronized();
			assert(runtime.getNativeCheckpoints().some((checkpoint) => checkpoint.id === "racing"));
			assert.deepEqual(peerRuntime.getNativeCheckpoints(), runtime.getNativeCheckpoints());
		} finally {
			source.off("op", onOp);
		}
	});

	itExpects(
		"prunes and sweeps history while cold-restoring retained deltas and historical-only images",
		[
			{
				eventName: "fluid:telemetry:Container:ContainerDispose",
				error: "Native checkpoint restored: reload without cached or pending state",
			},
		],
		async () => {
			const provider = getTestObjectProvider({ syncSummarizer: true });
			const gcOptions: IGCRuntimeOptions = {
				enableGCSweep: true,
				inactiveTimeoutMs: 0,
				sweepGracePeriodMs: 0,
			};
			const gcConfig: ITestContainerConfig = {
				...config,
				loaderProps: {
					configProvider: createTestConfigProvider({
						"Fluid.ContainerRuntime.NativeCheckpoints": true,
						// Exercise the real mark/sweep protocol without waiting for wall-clock expiry.
						"Fluid.GarbageCollection.TestOverride.TombstoneTimeoutMs": 0,
					}),
				},
				runtimeOptions: { ...config.runtimeOptions, gcOptions },
			};
			const source = await provider.makeTestContainer(gcConfig);
			await waitForContainerConnection(source);
			const entry = await getEntry(source);
			const runtime = await getRuntime(source);
			const liveBytes = createRandomBytes(64 * 1024, 17);
			const historicalBytes = createRandomBytes(64 * 1024, 91);
			const liveImage = await runtime.uploadBlob(liveBytes.buffer);
			const discardedImage = await runtime.uploadBlob(createRandomBytes(64 * 1024, 42).buffer);
			const discardedImageRoute = toFluidHandleInternal(discardedImage).absolutePath;
			entry.root.set("liveImage", liveImage);
			entry.root.set("historicalImage", discardedImage);
			entry.root.set("noise", Buffer.from(createRandomBytes(32 * 1024, 1)).toString("base64"));
			await provider.ensureSynchronized();
			const discarded = await runtime.createNativeCheckpoint("discarded");
			await provider.ensureSynchronized();

			const historicalImage = await runtime.uploadBlob(historicalBytes.buffer);
			const historicalRoute = toFluidHandleInternal(historicalImage).absolutePath;
			entry.root.set("historicalImage", historicalImage);
			entry.root.set("noise", Buffer.from(createRandomBytes(32 * 1024, 2)).toString("base64"));
			let anchor = discarded;
			for (let point = 0; point < 5; point++) {
				entry.root.set("value", `anchor-${point}`);
				await provider.ensureSynchronized();
				anchor = await runtime.createNativeCheckpoint(`anchor-${point}`);
				await provider.ensureSynchronized();
				if (anchor.baseId === undefined) {
					break;
				}
			}
			assert.equal(
				anchor.baseId,
				undefined,
				"A bounded chain must produce an independent anchor",
			);
			entry.root.set("value", "retained delta");
			await provider.ensureSynchronized();
			const delta = await runtime.createNativeCheckpoint("retained-delta");
			await provider.ensureSynchronized();
			assert.equal(delta.baseId, anchor.id);
			entry.root.delete("historicalImage");
			entry.root.set("value", "current content");
			await provider.ensureSynchronized();
			const all = runtime.getNativeCheckpoints();
			runtime.pruneNativeCheckpoints({ minAgeMs: 0, targetCount: 1 });
			await provider.ensureSynchronized();
			const retained = runtime.getNativeCheckpoints();
			assert.deepEqual(
				retained.map((checkpoint) => checkpoint.id),
				[anchor.id, delta.id],
			);
			const removedRoutes = [
				...all
					.filter((checkpoint) => !retained.some((keep) => keep.id === checkpoint.id))
					.map((checkpoint) => checkpoint.route),
				discardedImageRoute,
			];
			const retainedRoutes = [
				anchor.route,
				delta.route,
				historicalRoute,
				toFluidHandleInternal(liveImage).absolutePath,
			];
			const { summarizer } = await createSummarizer(provider, source, {
				...gcConfig,
				runtimeOptions: { gcOptions },
			});
			try {
				const marked = await summarizeNow(summarizer, {
					reason: "mark pruned history",
					fullTree: true,
				});
				const markedState = getGCStateFromSummary(marked.summaryTree);
				assert(markedState !== undefined);
				for (const route of removedRoutes) {
					assert.equal(typeof markedState.gcNodes[route]?.unreferencedTimestampMs, "number");
				}
				for (const route of retainedRoutes) {
					const node: (typeof markedState.gcNodes)[string] | undefined =
						markedState.gcNodes[route];
					assert(node !== undefined);
					assert.equal(node.unreferencedTimestampMs, undefined, `Retained root ${route}`);
				}
				await summarizeNow(summarizer, { reason: "sweep pruned history", fullTree: true });
				await provider.ensureSynchronized();
				const swept = await summarizeNow(summarizer, {
					reason: "persist swept history",
					fullTree: true,
				});
				const deleted = getGCDeletedStateFromSummary(swept.summaryTree);
				const sweptState = getGCStateFromSummary(swept.summaryTree);
				assert(deleted !== undefined && sweptState !== undefined);
				for (const route of removedRoutes) {
					assert(deleted.includes(route), `Sweep must delete ${route}`);
					assert.equal(sweptState.gcNodes[route], undefined);
					assert.equal(
						runtime.lookupTemporaryBlobStorageId(route.slice("/_blobs/".length)),
						undefined,
					);
				}
				for (const route of retainedRoutes) {
					assert(!deleted.includes(route));
					assert(sweptState.gcNodes[route] !== undefined);
				}
				source.close();
				summarizer.close();
				const worker = await provider.loadTestContainer(gcConfig, {
					[LoaderHeader.cache]: false,
					[LoaderHeader.version]: swept.summaryVersion,
					[LoaderHeader.clientDetails]: {
						capabilities: { interactive: false },
						type: "summarizer",
					},
					[DriverHeader.summarizingClient]: true,
				});
				await waitForContainerConnection(worker);
				await provider.ensureSynchronized();
				const publisher = await getRuntime(worker);
				assert.deepEqual(publisher.getNativeCheckpoints(), retained);
				const reads = spy(publisher.storage, "readBlob");
				publisher.requestNativeCheckpointRestore("restore-after-gc", delta.id);
				await provider.ensureSynchronized();
				provider.opProcessingController.resumeProcessing();
				await publisher.publishNativeCheckpointRestore();
				await provider.ensureSynchronized();
				for (const checkpoint of retained) {
					const storageId = publisher.lookupTemporaryBlobStorageId(
						checkpoint.route.slice("/_blobs/".length),
					);
					assert(
						reads.calledWith(storageId),
						"Cold restore must reconstruct each retained delta dependency",
					);
				}
				reads.restore();
				const restored = await provider.loadTestContainer(gcConfig, {
					[LoaderHeader.cache]: false,
				});
				await waitForContainerConnection(restored);
				const restoredEntry = await getEntry(restored);
				assert.equal(restoredEntry.root.get("value"), "retained delta");
				for (const [key, bytes, original] of [
					["historicalImage", historicalBytes, historicalImage],
					["liveImage", liveBytes, liveImage],
				] satisfies [string, Uint8Array, IFluidHandle<ArrayBufferLike>][]) {
					const handle = restoredEntry.root.get<IFluidHandle<ArrayBufferLike>>(key);
					assert(handle !== undefined);
					assert.equal(
						toFluidHandleInternal(handle).absolutePath,
						toFluidHandleInternal(original).absolutePath,
					);
					assert.deepEqual(new Uint8Array(await handle.get()), bytes);
				}
			} finally {
				summarizer.close();
			}
		},
	);

	itExpects(
		"restores attribution keys and their runtime user/timestamp records",
		[
			{
				eventName: "fluid:telemetry:Container:ContainerDispose",
				error: "Native checkpoint restored: reload without cached or pending state",
			},
		],
		async () => {
			const provider = getTestObjectProvider({ syncSummarizer: true });
			const options = {
				cache: false,
				attribution: { track: true, policyFactory: createInsertOnlyAttributionPolicy },
			};
			const attributedConfig: ITestContainerConfig = {
				...config,
				enableAttribution: true,
				loaderProps: {
					options,
					configProvider: createTestConfigProvider({
						"Fluid.ContainerRuntime.NativeCheckpoints": true,
						[enableOnNewFileKey]: true,
					}),
				},
			};
			async function readAttribution(
				container: IContainer,
			): Promise<{ sequenceNumber: number; info: AttributionInfo }[]> {
				const entry = await getEntry(container);
				const attributedText = await entry.getSharedObject<SharedString>("text");
				const attributor = await getRuntimeAttributor(entry.context.containerRuntime);
				assert(attributor !== undefined);
				const result: { sequenceNumber: number; info: AttributionInfo }[] = [];
				for (let position = 0; position < attributedText.getLength(); position++) {
					const { segment, offset } = attributedText.getContainingSegment(position);
					assert(segment !== undefined && offset !== undefined);
					const key = segment.attribution?.getAtOffset(offset);
					assert(
						key?.type === "op",
						"Each acknowledged character must retain an attribution key",
					);
					result.push({ sequenceNumber: key.seq, info: attributor.get(key) });
				}
				return result;
			}
			const source = await provider.makeTestContainer(attributedConfig);
			const peer = await provider.loadTestContainer(attributedConfig);
			await Promise.all(
				[source, peer].map(async (container) => waitForContainerConnection(container)),
			);
			const runtime = await getRuntime(source);
			const text = await (await getEntry(source)).getSharedObject<SharedString>("text");
			const peerText = await (await getEntry(peer)).getSharedObject<SharedString>("text");
			text.insertText(0, "source");
			await provider.ensureSynchronized();
			peerText.insertText(peerText.getLength(), " peer");
			await provider.ensureSynchronized();
			const attribution = structuredClone(await readAttribution(source));
			await runtime.createNativeCheckpoint("attributed");
			await provider.ensureSynchronized();
			text.replaceText(0, text.getLength(), "discarded");
			await provider.ensureSynchronized();
			const { summarizer } = await createSummarizer(provider, source, {
				...attributedConfig,
				runtimeOptions: undefined,
			});
			const { summaryVersion } = await summarizeNow(summarizer);
			source.close();
			peer.close();
			summarizer.close();
			const worker = await provider.loadTestContainer(attributedConfig, {
				[LoaderHeader.version]: summaryVersion,
				[LoaderHeader.clientDetails]: {
					capabilities: { interactive: false },
					type: "summarizer",
				},
				[DriverHeader.summarizingClient]: true,
			});
			await waitForContainerConnection(worker);
			const publisher = await getRuntime(worker);
			publisher.requestNativeCheckpointRestore("restore-attribution", "attributed");
			await provider.ensureSynchronized();
			provider.opProcessingController.resumeProcessing();
			await publisher.publishNativeCheckpointRestore();
			await provider.ensureSynchronized();
			const restored = await provider.loadTestContainer(attributedConfig);
			await waitForContainerConnection(restored);
			const restoredText = await (await getEntry(restored)).getSharedObject<SharedString>(
				"text",
			);
			assert.equal(restoredText.getText(), "source peer");
			assert.deepEqual(await readAttribution(restored), attribution);
			restoredText.insertText(restoredText.getLength(), " new");
			await provider.ensureSynchronized();
			const updated = await readAttribution(restored);
			assert.deepEqual(updated.slice(0, attribution.length), attribution);
			assert.equal(updated.length, attribution.length + 4);
		},
	);

	itExpects(
		"restores a stored checkpoint after disposing the capture client, reusing attachments",
		[
			{
				eventName: "fluid:telemetry:Container:ContainerDispose",
				error: "Native checkpoint restored: reload without cached or pending state",
			},
		],
		async () => {
			const provider = getTestObjectProvider({ syncSummarizer: true });
			const source = await provider.makeTestContainer(config);
			await waitForContainerConnection(source);
			const entry = await getEntry(source);
			const runtime = await getRuntime(source);
			const text = await entry.getSharedObject<SharedString>("text");
			const table = await entry.getSharedObject<SharedMatrix>("table");
			table.insertRows(0, 1);
			table.insertCols(0, 1);
			table.setCell(0, 0, "historical cell");
			text.insertText(0, "historical text");
			entry.root.set("value", "historical map");
			const image = await runtime.uploadBlob(new Uint8Array(1024 * 1024).fill(17).buffer);
			entry.root.set("image", image);
			await provider.ensureSynchronized();
			const checkpoint = await runtime.createNativeCheckpoint("first");
			await provider.ensureSynchronized();
			assert(checkpoint.bytes < 100_000, "Checkpoint must not embed the 1 MiB image");
			assert.equal(checkpoint.assets.length, 1);
			text.replaceText(0, text.getLength(), "new text");
			entry.root.set("value", "new map");
			table.setCell(0, 0, "new cell");
			entry.root.delete("image");
			await provider.ensureSynchronized();
			const { summarizer } = await createSummarizer(provider, source, {
				...config,
				runtimeOptions: undefined,
			});
			const { summaryVersion } = await summarizeNow(summarizer);
			source.close();
			summarizer.close();

			const requester = await provider.loadTestContainer(config, {
				[LoaderHeader.version]: summaryVersion,
				[LoaderHeader.clientDetails]: {
					capabilities: { interactive: false },
					type: "summarizer",
				},
				[DriverHeader.summarizingClient]: true,
			});
			await waitForContainerConnection(requester);
			const requesterRuntime = await getRuntime(requester);
			assert.equal(requesterRuntime.getNativeCheckpoints().length, 1);
			const storedId = requesterRuntime.lookupTemporaryBlobStorageId(
				checkpoint.route.slice("/_blobs/".length),
			);
			assert(storedId !== undefined);
			assert.equal(
				(
					await timeoutAwait(requesterRuntime.storage.readBlob(storedId), {
						errorMsg: "Stored checkpoint blob was not readable",
					})
				).byteLength,
				checkpoint.bytes,
			);
			let closeReason: string | undefined;
			requester.on("closed", (error) => {
				closeReason = error?.message;
			});
			requesterRuntime.requestNativeCheckpointRestore("restore-first", "first");
			await provider.ensureSynchronized();
			assert(!requester.closed, closeReason);
			provider.opProcessingController.resumeProcessing();
			const restoredVersion = await timeoutAwait(
				requesterRuntime.publishNativeCheckpointRestore(),
				{
					errorMsg: "Restore summary was not acknowledged",
				},
			);
			await provider.ensureSynchronized();

			const restored = await provider.loadTestContainer(config, {
				[LoaderHeader.version]: restoredVersion,
			});
			await waitForContainerConnection(restored);
			const restoredEntry = await getEntry(restored);
			assert.equal(restoredEntry.root.get("value"), "historical map");
			const restoredText = await restoredEntry.getSharedObject<SharedString>("text");
			assert.equal(restoredText.getText(), "historical text");
			assert.equal(
				(await restoredEntry.getSharedObject<SharedMatrix>("table")).getCell(0, 0),
				"historical cell",
			);
			const restoredImage = restoredEntry.root.get<IFluidHandle<ArrayBufferLike>>("image");
			assert(restoredImage !== undefined);
			assert.equal((await restoredImage.get()).byteLength, 1024 * 1024);
			assert.deepEqual(
				new Uint8Array(await restoredImage.get()),
				new Uint8Array(1024 * 1024).fill(17),
			);
			const peer = await provider.loadTestContainer(config, {
				[LoaderHeader.version]: restoredVersion,
			});
			await waitForContainerConnection(peer);
			restoredText.insertText(restoredText.getLength(), " edited again");
			await provider.ensureSynchronized();
			const peerEntry = await getEntry(peer);
			assert.equal(
				(await peerEntry.getSharedObject<SharedString>("text")).getText(),
				"historical text edited again",
			);
		},
	);

	for (const crashPoint of [
		"before-proposal",
		"after-upload",
		"after-proposal",
		"after-ack",
	]) {
		const summaryAcknowledged = crashPoint === "after-proposal" || crashPoint === "after-ack";
		itExpects(
			`recovers a publisher crash ${crashPoint} from a fresh client`,
			[
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					error: "Native checkpoint restored: reload without cached or pending state",
				},
				...(!summaryAcknowledged
					? [
							{
								eventName: "fluid:telemetry:Container:ContainerDispose",
								error: "Native checkpoint restored: reload without cached or pending state",
							},
						]
					: []),
			],
			async () => {
				const provider = getTestObjectProvider({ syncSummarizer: true });
				const source = await provider.makeTestContainer(config);
				await waitForContainerConnection(source);
				const runtime = await getRuntime(source);
				const entry = await getEntry(source);
				entry.root.set("value", "checkpoint");
				await provider.ensureSynchronized();
				await runtime.createNativeCheckpoint("recover");
				await provider.ensureSynchronized();
				entry.root.set("value", "discard");
				await provider.ensureSynchronized();
				const { summarizer } = await createSummarizer(provider, source, {
					...config,
					runtimeOptions: undefined,
				});
				const { summaryVersion: staleVersion } = await summarizeNow(summarizer);
				summarizer.close();
				async function loadWorker(): Promise<IContainer> {
					const loadedWorker = await provider.loadTestContainer(config, {
						[LoaderHeader.cache]: false,
						[LoaderHeader.clientDetails]: {
							capabilities: { interactive: false },
							type: "summarizer",
						},
						[DriverHeader.summarizingClient]: true,
					});
					await waitForContainerConnection(loadedWorker);
					await provider.ensureSynchronized();
					return loadedWorker;
				}
				const worker = await loadWorker();
				const publisher = await getRuntime(worker);
				publisher.requestNativeCheckpointRestore("recover-restore", "recover");
				await provider.ensureSynchronized();
				provider.opProcessingController.resumeProcessing();
				if (!summaryAcknowledged) {
					const uploadSummary = publisher.storage.uploadSummaryWithContext.bind(
						publisher.storage,
					);
					const upload = stub(publisher.storage, "uploadSummaryWithContext").callsFake(
						async (...args) => {
							if (crashPoint === "before-proposal") {
								throw new Error("injected upload failure");
							}
							const handle = await uploadSummary(...args);
							worker.close();
							return handle;
						},
					);
					try {
						await assert.rejects(publisher.publishNativeCheckpointRestore());
					} finally {
						upload.restore();
						worker.close();
					}
				} else {
					const acknowledged = new Deferred<void>();
					const onSourceOp = (
						message: import("@fluidframework/driver-definitions/internal").ISequencedDocumentMessage,
					): void => {
						if (message.type === MessageType.SummaryAck) {
							acknowledged.resolve();
						}
					};
					const onWorkerOp = (
						message: import("@fluidframework/driver-definitions/internal").ISequencedDocumentMessage,
					): void => {
						if (
							message.type ===
							(crashPoint === "after-proposal"
								? MessageType.Summarize
								: MessageType.SummaryAck)
						) {
							worker.close();
						}
					};
					source.on("op", onSourceOp);
					worker.on("op", onWorkerOp);
					try {
						await assert.rejects(publisher.publishNativeCheckpointRestore());
						await timeoutAwait(acknowledged.promise, {
							errorMsg: "Service did not acknowledge the crashed publisher's proposal",
						});
					} finally {
						source.off("op", onSourceOp);
						worker.off("op", onWorkerOp);
					}
				}
				assert(!source.closed, "Without completion the old generation remains fenced");
				const replacement = await loadWorker();
				const recoveryRuntime = await getRuntime(replacement);
				const recovery = recoveryRuntime.getNativeCheckpointRestore();
				assert(recovery !== undefined);
				assert.equal(
					recoveryRuntime.getNativeCheckpointRestore()?.phase,
					summaryAcknowledged ? "restored" : "ordered",
				);
				const uploadSpy = spy(recoveryRuntime.storage, "uploadSummaryWithContext");
				provider.opProcessingController.resumeProcessing();
				await recoveryRuntime.publishNativeCheckpointRestore();
				await provider.ensureSynchronized();
				assert.equal(uploadSpy.callCount, summaryAcknowledged ? 0 : 1);
				uploadSpy.restore();
				assert(source.closed);
				const loader = provider.makeTestLoader(config);
				assert(loader instanceof Loader);
				const evictionStarted = new Deferred<void>();
				const evictionComplete = new Deferred<void>();
				const createService = spy(
					loader.services.documentServiceFactory,
					"createDocumentService",
				);
				const reloadProps = {
					...loader.services,
					request: {
						url: await provider.driver.createContainerUrl(provider.documentId),
						headers: { [LoaderHeader.version]: staleVersion, [LoaderHeader.cache]: true },
					},
					pendingLocalState: "stale pending state must not be parsed or replayed",
				};
				const loading = loadContainerAfterNativeCheckpointRestore(
					reloadProps,
					recovery.restore,
					async () => {
						evictionStarted.resolve();
						await evictionComplete.promise;
					},
				);
				async function verifyEviction(): Promise<void> {
					try {
						await timeoutAwait(evictionStarted.promise, {
							errorMsg: "Host eviction did not start",
						});
						assert.equal(
							createService.callCount,
							0,
							"Loading must await host cache and pending-state eviction",
						);
					} finally {
						evictionComplete.resolve();
						createService.restore();
					}
				}
				const [restored] = await Promise.all([
					loading.then((container) => {
						assert(provider.opProcessingController instanceof LoaderContainerTracker);
						provider.opProcessingController.addContainer(container);
						return container;
					}),
					verifyEviction(),
				]);
				try {
					await waitForContainerConnection(restored);
					assert.equal((await getEntry(restored)).root.get("value"), "checkpoint");
					const peer = await provider.loadTestContainer(config);
					await waitForContainerConnection(peer);
					(await getEntry(restored)).root.set("value", "edited after recovery");
					await provider.ensureSynchronized();
					assert.equal((await getEntry(peer)).root.get("value"), "edited after recovery");
					(await getEntry(peer)).root.set("peer", "collaboration resumed");
					await provider.ensureSynchronized();
					assert.equal((await getEntry(restored)).root.get("peer"), "collaboration resumed");
				} finally {
					restored.close();
				}
			},
		);
	}

	for (const seed of [17, 123]) {
		const rounds = 10;
		itExpects(
			`mixes edits, pruning, cold reloads and restores with incompressible content (seed ${seed})`,
			Array.from({ length: rounds * 3 }, (_value, index) => ({
				eventName:
					index % 3 === 0
						? "fluid:telemetry:Container:ContainerDispose"
						: "fluid:telemetry:Container:ContainerClose",
				error: "Native checkpoint restored: reload without cached or pending state",
			})),
			async function () {
				this.timeout(180_000);
				const provider = getTestObjectProvider({ syncSummarizer: true });
				async function loadModel(container: IContainer): Promise<{
					entry: TestFluidObject;
					runtime: ContainerRuntimeType;
					text: SharedString;
					table: SharedMatrix<string>;
				}> {
					const entry = await getEntry(container);
					return {
						entry,
						runtime: await getRuntime(container),
						text: await entry.getSharedObject<SharedString>("text"),
						table: await entry.getSharedObject<SharedMatrix<string>>("table"),
					};
				}
				let source = await provider.makeTestContainer(config);
				await waitForContainerConnection(source);
				let model = await loadModel(source);
				const images = [
					createRandomBytes(2 * 1024 * 1024, seed),
					createRandomBytes(2 * 1024 * 1024, seed + 1),
				];
				const handles = await Promise.all(
					images.map(async (bytes) => model.runtime.uploadBlob(bytes.buffer)),
				);
				const imageRoutes = handles.map(
					(handle) => toFluidHandleInternal(handle).absolutePath,
				);
				model.entry.root.set("images", handles);
				let expected = {
					value: "initial",
					text: Buffer.from(createRandomBytes(12 * 1024, seed + 2)).toString("base64"),
					noise: Buffer.from(createRandomBytes(32 * 1024, seed + 3)).toString("base64"),
					cells: [
						["a", "b"],
						["c", "d"],
					],
					image: 0,
				};
				model.entry.root.set("value", expected.value);
				model.entry.root.set("noise", expected.noise);
				model.entry.root.set("image", handles[0]);
				model.text.insertText(0, expected.text);
				model.table.insertRows(0, 2);
				model.table.insertCols(0, 2);
				for (const [row, cells] of expected.cells.entries()) {
					for (const [column, value] of cells.entries()) {
						model.table.setCell(row, column, value);
					}
				}
				await provider.ensureSynchronized();
				let peer = await provider.loadTestContainer(config);
				await waitForContainerConnection(peer);
				await provider.ensureSynchronized();
				let peerModel = await loadModel(peer);
				const baseline = await model.runtime.summarize({
					fullTree: true,
					trackState: false,
					runGC: false,
				});
				const snapshots = new Map<string, typeof expected>();
				const captureTimes: number[] = [];
				const restoreTimes: number[] = [];
				const pruneTimes: number[] = [];
				const coldReadCounts: number[] = [];
				let uploadedBytes = 0;
				let sampledHeapPeak = process.memoryUsage().heapUsed;
				let sampledArrayBufferPeak = process.memoryUsage().arrayBuffers;
				const initialHeap = sampledHeapPeak;
				const initialArrayBuffers = sampledArrayBufferPeak;
				function sampleMemory(): void {
					const memory = process.memoryUsage();
					sampledHeapPeak = Math.max(sampledHeapPeak, memory.heapUsed);
					sampledArrayBufferPeak = Math.max(sampledArrayBufferPeak, memory.arrayBuffers);
				}
				let random = seed;
				function getRandom(limit: number): number {
					random = (random * 1664525 + 1013904223) % 4294967296;
					return Math.floor((random / 4294967296) * limit);
				}
				async function validateModel(
					current: Awaited<ReturnType<typeof loadModel>>,
					context: string,
				): Promise<void> {
					assert.equal(current.entry.root.get("value"), expected.value);
					assert.equal(current.entry.root.get("noise"), expected.noise);
					const actualText = current.text.getText();
					if (actualText !== expected.text) {
						const offset = [...expected.text].findIndex(
							(character, index) => actualText[index] !== character,
						);
						assert.fail(
							`${context}: text mismatch at ${offset}; actual=${JSON.stringify(actualText.slice(Math.max(0, offset - 30), offset + 80))}; expected=${JSON.stringify(expected.text.slice(Math.max(0, offset - 30), offset + 80))}; lengths=${actualText.length}/${expected.text.length}`,
						);
					}
					for (const [row, cells] of expected.cells.entries()) {
						for (const [column, value] of cells.entries()) {
							assert.equal(current.table.getCell(row, column), value);
						}
					}
					const image = current.entry.root.get<IFluidHandle<ArrayBufferLike>>("image");
					assert(image !== undefined);
					assert.equal(toFluidHandleInternal(image).absolutePath, imageRoutes[expected.image]);
					assert.deepEqual(new Uint8Array(await image.get()), images[expected.image]);
				}
				const loader = provider.makeTestLoader(config);
				assert(loader instanceof Loader);
				const request = { url: await provider.driver.createContainerUrl(provider.documentId) };
				for (let round = 0; round < rounds; round++) {
					const { summarizer } = await createSummarizer(provider, source, {
						...config,
						runtimeOptions: undefined,
					});
					try {
						for (let point = 0; point < 12; point++) {
							for (let edit = 0; edit < 3; edit++) {
								const editor = getRandom(2) === 0 ? model : peerModel;
								const value = `${round}:${point}:${edit}:${random}`;
								switch (getRandom(6)) {
									case 0: {
										editor.entry.root.set("value", value);
										expected.value = value;
										break;
									}
									case 1: {
										const offset = getRandom(expected.text.length - 32);
										editor.text.replaceText(offset, offset + value.length, value);
										expected.text =
											expected.text.slice(0, offset) +
											value +
											expected.text.slice(offset + value.length);
										break;
									}
									case 2: {
										const row = getRandom(2);
										const column = getRandom(2);
										editor.table.setCell(row, column, value);
										expected.cells[row][column] = value;
										break;
									}
									case 3: {
										// Include complete replacements, not only favorable small deltas.
										expected.noise = Buffer.from(
											createRandomBytes(32 * 1024, random),
										).toString("base64");
										editor.entry.root.set("noise", expected.noise);
										break;
									}
									case 4: {
										expected.image = getRandom(images.length);
										const currentImages =
											editor.entry.root.get<IFluidHandle<ArrayBufferLike>[]>("images");
										assert(currentImages !== undefined);
										editor.entry.root.set("image", currentImages[expected.image]);
										break;
									}
									case 5: {
										peer.disconnect();
										peer.connect();
										await waitForContainerConnection(peer);
										break;
									}
									default: {
										assert.fail("Unknown lifecycle operation");
									}
								}
								await provider.ensureSynchronized();
							}
							const id = `${round}:${point}`;
							assert(
								model.text.getText() === expected.text,
								`Text oracle before capture ${id}`,
							);
							assert(
								peerModel.text.getText() === expected.text,
								`Peer text oracle before capture ${id}`,
							);
							snapshots.set(id, structuredClone(expected));
							const captureStart = performance.now();
							const checkpoint = await model.runtime.createNativeCheckpoint(id);
							await provider.ensureSynchronized();
							captureTimes.push(performance.now() - captureStart);
							uploadedBytes += checkpoint.bytes;
							assert(
								checkpoint.bytes < 128 * 1024,
								"Archive payload must not contain the 4 MiB of images",
							);
							assert.deepEqual([...checkpoint.assets].sort(), [...imageRoutes].sort());
							if (point % 6 === 5) {
								const pruneStart = performance.now();
								model.runtime.pruneNativeCheckpoints({ minAgeMs: 0, targetCount: 12 });
								await provider.ensureSynchronized();
								pruneTimes.push(performance.now() - pruneStart);
								const retained = new Set(
									model.runtime.getNativeCheckpoints().map((entry) => entry.id),
								);
								for (const retainedId of snapshots.keys()) {
									if (!retained.has(retainedId)) {
										snapshots.delete(retainedId);
									}
								}
							}
							sampleMemory();
						}
						await validateModel(model, `Source before restore ${round}`);
						await validateModel(peerModel, `Peer before restore ${round}`);
						await summarizeNow(summarizer);
						summarizer.close();
						const worker = await provider.loadTestContainer(config, {
							[LoaderHeader.cache]: false,
							[LoaderHeader.clientDetails]: {
								capabilities: { interactive: false },
								type: "summarizer",
							},
							[DriverHeader.summarizingClient]: true,
						});
						await waitForContainerConnection(worker);
						await provider.ensureSynchronized();
						const publisher = await getRuntime(worker);
						const choices = publisher.getNativeCheckpoints();
						const selected =
							choices[
								round % 3 === 0
									? 0
									: round % 3 === 1
										? choices.length - 1
										: getRandom(choices.length)
							];
						assert(selected !== undefined);
						const archived = snapshots.get(selected.id);
						assert(archived !== undefined);
						const payloadStorageIds = new Set(
							choices.map((checkpoint) =>
								publisher.lookupTemporaryBlobStorageId(
									checkpoint.route.slice("/_blobs/".length),
								),
							),
						);
						const reads = spy(publisher.storage, "readBlob");
						const start = performance.now();
						model.runtime.requestNativeCheckpointRestore(`mixed-${round}`, selected.id);
						await provider.ensureSynchronized();
						const recovery = publisher.getNativeCheckpointRestore();
						assert(recovery !== undefined);
						const workerDisposed = new Deferred<void>();
						const sourceClosed = new Deferred<void>();
						const peerClosed = new Deferred<void>();
						publisher.once("dispose", () => workerDisposed.resolve());
						source.once("closed", () => sourceClosed.resolve());
						peer.once("closed", () => peerClosed.resolve());
						await provider.opProcessingController.pauseProcessing(source, peer);
						try {
							provider.opProcessingController.resumeProcessing(worker);
							await publisher.publishNativeCheckpointRestore();
							await timeoutAwait(workerDisposed.promise);
							provider.opProcessingController.resumeProcessing(source);
							await timeoutAwait(sourceClosed.promise);
							provider.opProcessingController.resumeProcessing(peer);
							await timeoutAwait(peerClosed.promise);
							await provider.ensureSynchronized();
							const payloadReads = reads
								.getCalls()
								.filter((call) => payloadStorageIds.has(call.args[0])).length;
							assert.equal(payloadReads, (selected.depth ?? 0) + 1);
							assert(
								payloadReads <= 5,
								"Cold reconstruction must remain bounded after pruning",
							);
							coldReadCounts.push(payloadReads);
						} finally {
							reads.restore();
						}
						assert(source.closed && peer.closed && worker.closed);
						let evicted = false;
						source = await loadContainerAfterNativeCheckpointRestore(
							{ ...loader.services, logger: provider.logger, request },
							recovery.restore,
							async () => {
								evicted = true;
							},
						);
						assert(provider.opProcessingController instanceof LoaderContainerTracker);
						provider.opProcessingController.addContainer(source);
						await waitForContainerConnection(source);
						assert(evicted);
						model = await loadModel(source);
						expected = structuredClone(archived);
						await validateModel(model, `Source after restore ${round} to ${selected.id}`);
						restoreTimes.push(performance.now() - start);
						peer = await provider.loadTestContainer(config, { [LoaderHeader.cache]: false });
						await waitForContainerConnection(peer);
						await provider.ensureSynchronized();
						peerModel = await loadModel(peer);
						await validateModel(peerModel, `Peer after restore ${round} to ${selected.id}`);
						// Every restored generation must remain editable, including the final round.
						expected.value = `post-restore-${round}`;
						model.entry.root.set("value", expected.value);
						await provider.ensureSynchronized();
						assert.equal(peerModel.entry.root.get("value"), expected.value);
						sampleMemory();
					} finally {
						summarizer.close();
					}
				}
				const finalSummary = await model.runtime.summarize({
					fullTree: true,
					trackState: false,
					runGC: false,
				});
				assert(
					finalSummary.stats.totalBlobSize - baseline.stats.totalBlobSize < 100 * 1024,
					"Boot growth must be metadata, not archived content or image bytes",
				);
				const catalog: (typeof finalSummary.summary.tree)[string] | undefined =
					finalSummary.summary.tree[".nativeCheckpoints"];
				assert(catalog?.type === SummaryType.Blob && typeof catalog.content === "string");
				const retainedBytes = model.runtime
					.getNativeCheckpoints()
					.reduce((total, checkpoint) => total + checkpoint.bytes, 0);
				const metricsPrefix = process.env.FLUID_NATIVE_CHECKPOINT_METRICS_PREFIX;
				if (metricsPrefix !== undefined) {
					finishLoggingReport(
						{
							content: [
								{
									benchmarkName: `Native checkpoint mixed lifecycle (${provider.driver.type}, seed ${seed}, 120 captures, 10 restores)`,
									data: [
										{
											name: "Capture through acknowledgement mean",
											value:
												captureTimes.reduce((total, value) => total + value, 0) /
												captureTimes.length,
											units: "ms",
											type: ValueType.SmallerIsBetter,
											significance: "Primary",
										},
										{
											name: "Capture through acknowledgement p95",
											value: [...captureTimes].sort((left, right) => left - right)[
												Math.ceil(captureTimes.length * 0.95) - 1
											],
											units: "ms",
										},
										{
											name: "Cold restore through verified load mean",
											value:
												restoreTimes.reduce((total, value) => total + value, 0) /
												restoreTimes.length,
											units: "ms",
										},
										{
											name: "Cold restore payload reads maximum",
											value: Math.max(...coldReadCounts),
											units: "count",
										},
										{
											name: "Pruning through acknowledgement mean",
											value:
												pruneTimes.reduce((total, value) => total + value, 0) /
												pruneTimes.length,
											units: "ms",
										},
										{
											name: "Cumulative uploaded checkpoint payload",
											value: uploadedBytes,
											units: "bytes",
										},
										{
											name: "Retained checkpoint payload",
											value: retainedBytes,
											units: "bytes",
										},
										{
											name: "Retained checkpoint count",
											value: model.runtime.getNativeCheckpoints().length,
											units: "count",
										},
										{
											name: "Initial boot structural bytes",
											value: baseline.stats.totalBlobSize,
											units: "bytes",
										},
										{
											name: "Final boot structural bytes",
											value: finalSummary.stats.totalBlobSize,
											units: "bytes",
										},
										{
											name: "Catalog boot bytes",
											value: Buffer.byteLength(catalog.content),
											units: "bytes",
										},
										{
											name: "Shared image bytes",
											value: images.reduce((total, image) => total + image.byteLength, 0),
											units: "bytes",
										},
										{
											name: "Stage-sampled heap growth peak",
											value: sampledHeapPeak - initialHeap,
											units: "bytes",
										},
										{
											name: "Stage-sampled array buffer growth peak",
											value: sampledArrayBufferPeak - initialArrayBuffers,
											units: "bytes",
										},
										{
											name: "Process high-water RSS including test harness",
											value: process.resourceUsage().maxRSS * 1024,
											units: "bytes",
										},
									],
								},
							],
						},
						false,
						`${metricsPrefix}-mixed-${seed}.json`,
					);
				}
			},
		);
	}

	for (const seed of [1, 42]) {
		itExpects(
			`retains 100 points and races equivalent restores (seed ${seed})`,
			Array.from({ length: 4 }, (_value, index) => ({
				eventName:
					index < 2
						? "fluid:telemetry:Container:ContainerClose"
						: "fluid:telemetry:Container:ContainerDispose",
				error: "Native checkpoint restored: reload without cached or pending state",
			})),
			async function () {
				this.timeout(120000);
				const provider = getTestObjectProvider({ syncSummarizer: true });
				const source = await provider.makeTestContainer(config);
				await waitForContainerConnection(source);
				const entry = await getEntry(source);
				const runtime = await getRuntime(source);
				const uploadSpy = spy(runtime.storage, "createBlob");
				const accessMeasurements: Measurement[] = [];
				async function measureAccess(version: string, label: string): Promise<void> {
					if (process.env.FLUID_NATIVE_CHECKPOINT_METRICS_PREFIX === undefined) {
						return;
					}
					const bootTimes: number[] = [];
					const catalogTimes: number[] = [];
					const coldTimes: number[] = [];
					const warmTimes: number[] = [];
					let maxReads = 0;
					for (let sample = 0; sample < 7; sample++) {
						const start = performance.now();
						const loaded = await provider.loadTestContainer(config, {
							[LoaderHeader.cache]: false,
							[LoaderHeader.version]: version,
							[LoaderHeader.loadMode]: { deltaConnection: "none", opsBeforeReturn: "cached" },
						});
						try {
							const loadedRuntime = await getRuntime(loaded);
							bootTimes.push(performance.now() - start);
							const catalogStart = performance.now();
							for (let repeat = 0; repeat < 100; repeat++) {
								loadedRuntime.getNativeCheckpoints();
							}
							catalogTimes.push((performance.now() - catalogStart) / 100);
							const checkpoint = [...loadedRuntime.getNativeCheckpoints()].sort(
								(left, right) => (right.depth ?? 0) - (left.depth ?? 0),
							)[0];
							if (checkpoint !== undefined) {
								const reads = spy(loadedRuntime.storage, "readBlob");
								try {
									const coldStart = performance.now();
									const cold = await loadedRuntime.loadNativeCheckpointSummary(checkpoint.id);
									coldTimes.push(performance.now() - coldStart);
									maxReads = Math.max(maxReads, reads.callCount);
									assert(reads.callCount > 0 && reads.callCount <= 5);
									reads.resetHistory();
									const warmStart = performance.now();
									const warm = await loadedRuntime.loadNativeCheckpointSummary(checkpoint.id);
									warmTimes.push(performance.now() - warmStart);
									assert.deepEqual(warm, cold);
									assert.equal(
										reads.callCount,
										0,
										"One-entry cache must eliminate repeat reads",
									);
									warm.tree["caller-mutation"] = { type: SummaryType.Blob, content: "local" };
									assert.deepEqual(
										await loadedRuntime.loadNativeCheckpointSummary(checkpoint.id),
										cold,
										"Returned summary mutation must not affect cached checkpoint bytes",
									);
								} finally {
									reads.restore();
								}
							}
						} finally {
							loaded.close();
						}
					}
					for (const [operation, samples] of [
						["Snapshot-only fresh-container boot", bootTimes],
						["Catalog list", catalogTimes],
						["Cold checkpoint reconstruction", coldTimes],
						["Warm checkpoint reconstruction", warmTimes],
					] satisfies [string, number[]][]) {
						if (samples.length !== 0) {
							accessMeasurements.push(
								{
									name: `${label} ${operation} mean`,
									units: "ms",
									value: samples.reduce((sum, value) => sum + value, 0) / samples.length,
								},
								{
									name: `${label} ${operation} median`,
									units: "ms",
									value:
										[...samples].sort((left, right) => left - right)[
											Math.floor(samples.length / 2)
										] ?? 0,
								},
							);
						}
					}
					accessMeasurements.push({
						name: `${label} maximum archive reads`,
						value: maxReads,
						units: "count",
					});
				}
				let sourceCloseReason: string | undefined;
				source.on("closed", (error) => {
					sourceCloseReason = error?.message;
				});
				try {
					entry.root.set(
						"image",
						await runtime.uploadBlob(new Uint8Array(1024 * 1024).fill(seed).buffer),
					);
					await provider.ensureSynchronized();
					const peer = await provider.loadTestContainer(config);
					await waitForContainerConnection(peer);
					const peerEntry = await getEntry(peer);
					const expected: string[] = [];
					const { summarizer } = await createSummarizer(provider, source, {
						...config,
						runtimeOptions: undefined,
					});
					const sizes: number[] = [];
					const captureTimes: number[] = [];
					await measureAccess(
						(await summarizeNow(summarizer)).summaryVersion,
						"Before history",
					);
					const beforeHistory = await runtime.summarize({
						fullTree: true,
						trackState: false,
						runGC: false,
					});
					let random = seed;
					for (let index = 0; index < 100; index++) {
						random = (random * 1664525 + 1013904223) % 4294967296;
						const editor = random % 2 === 0 ? entry : peerEntry;
						const value = `${index}:${random}`;
						editor.root.set("value", value);
						expected.push(value);
						await provider.ensureSynchronized();
						assert(!source.closed, `Checkpoint ${index}: ${sourceCloseReason}`);
						const captureStart = performance.now();
						sizes.push((await runtime.createNativeCheckpoint(`point-${index}`)).bytes);
						await provider.ensureSynchronized();
						captureTimes.push(performance.now() - captureStart);
						if ((index + 1) % 25 === 0) {
							await summarizeNow(summarizer);
						}
					}
					assert.equal(runtime.getNativeCheckpoints().length, 100);
					assert(
						Math.max(...sizes) - Math.min(...sizes) < 2000,
						"Checkpoint packages must not recursively embed history",
					);
					assert.equal(
						uploadSpy.getCalls().filter((call) => call.args[0].byteLength >= 1024 * 1024)
							.length,
						1,
						"An unchanged image must be uploaded only once",
					);
					const { summaryVersion } = await summarizeNow(summarizer);
					await measureAccess(summaryVersion, "100 checkpoints");
					const afterHistory = await runtime.summarize({
						fullTree: true,
						trackState: false,
						runGC: false,
					});
					const workers = await Promise.all(
						[0, 1].map(async () =>
							provider.loadTestContainer(config, {
								[LoaderHeader.version]: summaryVersion,
								[LoaderHeader.clientDetails]: {
									capabilities: { interactive: false },
									type: "summarizer",
								},
								[DriverHeader.summarizingClient]: true,
							}),
						),
					);
					await Promise.all(workers.map(async (worker) => waitForContainerConnection(worker)));
					const workerRuntimes = await Promise.all(
						workers.map(async (worker) => getRuntime(worker)),
					);
					entry.root.set("value", "ordinary summary after workers loaded");
					await provider.ensureSynchronized();
					const { summaryVersion: latestSummaryVersion } = await summarizeNow(summarizer);
					await provider.ensureSynchronized();
					summarizer.close();
					await provider.opProcessingController.pauseProcessing(peer);
					const restoreStart = performance.now();
					runtime.requestNativeCheckpointRestore(`restore-${seed}`, `point-${seed}`);
					await provider.opProcessingController.processOutgoing(source);
					await provider.opProcessingController.processIncoming(source, ...workers);
					peerEntry.root.set("stale", "must not survive restore");
					await provider.ensureSynchronized();
					provider.opProcessingController.resumeProcessing();
					const reconnectingWorker = workers[0];
					assert(reconnectingWorker !== undefined);
					reconnectingWorker.disconnect();
					reconnectingWorker.connect();
					await waitForContainerConnection(reconnectingWorker);
					await provider.ensureSynchronized();
					assert(!reconnectingWorker.closed, "A clean publisher must survive reconnection");
					provider.opProcessingController.resumeProcessing();
					const delayedUpload = new Deferred<void>();
					const onPublisherDisposed = (): void => delayedUpload.resolve();
					const delayedPublisher = workerRuntimes[1];
					assert(delayedPublisher !== undefined);
					delayedPublisher.once("dispose", onPublisherDisposed);
					const publicationSpies = workerRuntimes.map((worker, index) => {
						const upload = worker.storage.uploadSummaryWithContext.bind(worker.storage);
						return stub(worker.storage, "uploadSummaryWithContext").callsFake(
							async (summary, context) => {
								const handle = await upload(summary, context);
								if (seed === 42 && index === 1) {
									await delayedUpload.promise;
								}
								return handle;
							},
						);
					});
					const results = await timeoutAwait(
						Promise.allSettled(
							workerRuntimes.map(async (worker) => worker.publishNativeCheckpointRestore()),
						),
						{ errorMsg: "Restore race did not finish" },
					).finally(() => {
						delayedUpload.resolve();
						delayedPublisher.off("dispose", onPublisherDisposed);
						for (const publicationSpy of publicationSpies) {
							publicationSpy.restore();
						}
					});
					if (seed === 42) {
						assert.equal(
							results[1]?.status,
							"rejected",
							"Disposal during upload must reject instead of waiting for an acknowledgement forever",
						);
					}
					assert(
						publicationSpies.every(
							(publicationSpy) =>
								publicationSpy.firstCall.args[1].ackHandle === latestSummaryVersion,
						),
						"Publishers must use the latest observed summary parent, not their loaded version",
					);
					const winner = results.find((result) => result.status === "fulfilled");
					assert(
						winner?.status === "fulfilled",
						"At least one equivalent publisher must succeed",
					);
					await provider.ensureSynchronized();
					assert(source.closed && peer.closed, "Old content clients must reload");
					const restored = await provider.loadTestContainer(config, {
						[LoaderHeader.version]: winner.value,
					});
					await waitForContainerConnection(restored);
					const restoredEntry = await getEntry(restored);
					const restoreTime = performance.now() - restoreStart;
					assert.equal(restoredEntry.root.get("value"), expected[seed]);
					assert.equal(
						restoredEntry.root.get("stale"),
						undefined,
						"Old-generation operations must not replay",
					);
					const restoredRuntime = await getRuntime(restored);
					assert.equal(restoredRuntime.getNativeCheckpoints().length, 100);
					for (const retained of restoredRuntime.getNativeCheckpoints()) {
						const blobId = restoredRuntime.lookupTemporaryBlobStorageId(
							retained.route.slice("/_blobs/".length),
						);
						assert(
							blobId !== undefined,
							"Restore must preserve the current archive's blob mappings",
						);
						assert.equal(
							(await restoredRuntime.storage.readBlob(blobId)).byteLength,
							retained.bytes,
						);
					}
					restoredEntry.root.set("value", "new generation");
					await provider.ensureSynchronized();
					const metricsPrefix = process.env.FLUID_NATIVE_CHECKPOINT_METRICS_PREFIX;
					if (metricsPrefix !== undefined) {
						const captureP95 = [...captureTimes].sort((left, right) => left - right)[94];
						assert(captureP95 !== undefined);
						finishLoggingReport(
							{
								content: [
									{
										benchmarkName: `Native checkpoints (seed ${seed}, ${provider.driver.type}, 100 points)`,
										data: [
											{
												name: "Capture through catalog ack mean",
												value:
													captureTimes.reduce((total, elapsed) => total + elapsed, 0) /
													captureTimes.length,
												units: "ms",
												type: ValueType.SmallerIsBetter,
												significance: "Primary",
											},
											{
												name: "Capture through catalog ack p95",
												value: captureP95,
												units: "ms",
											},
											{ name: "Restore through fresh load", value: restoreTime, units: "ms" },
											{
												name: "Archive payload",
												value: sizes.reduce((total, size) => total + size, 0),
												units: "bytes",
											},
											{
												name: "Summary structural bytes before history",
												value: beforeHistory.stats.totalBlobSize,
												units: "bytes",
											},
											{
												name: "Summary structural bytes after history",
												value: afterHistory.stats.totalBlobSize,
												units: "bytes",
											},
											{
												name: "Image blob uploads",
												value: uploadSpy
													.getCalls()
													.filter((call) => call.args[0].byteLength >= 1024 * 1024).length,
												units: "count",
											},
											{
												name: "Client blob upload bytes",
												value: uploadSpy
													.getCalls()
													.reduce((total, call) => total + call.args[0].byteLength, 0),
												units: "bytes",
											},
											...accessMeasurements,
										],
									},
								],
							},
							false,
							`${metricsPrefix}-${seed}.json`,
						);
					}
				} finally {
					uploadSpy.restore();
				}
			},
		);
	}
});

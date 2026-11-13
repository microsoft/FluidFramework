/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { enableOnNewFileKey, getRuntimeAttributor } from "@fluid-experimental/attributor";
import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { finishLoggingReport, ValueType } from "@fluid-tools/benchmark";
import { LoaderHeader, type IContainer } from "@fluidframework/container-definitions/internal";
import type { ContainerRuntime as ContainerRuntimeType } from "@fluidframework/container-runtime/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { Deferred } from "@fluidframework/core-utils/internal";
import { DriverHeader } from "@fluidframework/driver-definitions/internal";
import type { SharedString } from "@fluidframework/sequence/internal";
import type { SharedMatrix } from "@fluidframework/matrix/internal";
import { createInsertOnlyAttributionPolicy } from "@fluidframework/merge-tree/internal";
import type { AttributionInfo } from "@fluidframework/runtime-definitions/internal";
import { spy, stub } from "sinon";
import {
	createSummarizer,
	createTestConfigProvider,
	DataObjectFactoryType,
	summarizeNow,
	timeoutAwait,
	waitForContainerConnection,
	type ITestContainerConfig,
	TestFluidObject,
} from "@fluidframework/test-utils/internal";

/** Narrows the test entry point to its actual data object. */
async function getEntry(container: IContainer): Promise<TestFluidObject> {
	const entry = await container.getEntryPoint();
	assert(entry instanceof TestFluidObject);
	return entry;
}

describeCompat("Native checkpoints", "NoCompat", (getTestObjectProvider, apis) => {
	const { ContainerRuntime } = apis.containerRuntime;
	const { SharedString, SharedMatrix } = apis.dds;
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
			["text", SharedString.getFactory()],
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

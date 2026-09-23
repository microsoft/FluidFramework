/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import type {
	IContainerContext,
	IContainerStorageService,
} from "@fluidframework/container-definitions/internal";
import { Deferred } from "@fluidframework/core-utils/internal";
import {
	SummaryType,
	type ISummaryTree,
	type SummaryObject,
} from "@fluidframework/driver-definitions";
import {
	MessageType,
	type ISummaryContext,
} from "@fluidframework/driver-definitions/internal";
import type { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions/internal";
import { addBlobToSummary, calculateStats } from "@fluidframework/runtime-utils/internal";
import { createChildLogger, MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	MockAudience,
	MockDeltaManager,
	MockQuorumClients,
} from "@fluidframework/test-runtime-utils/internal";
import Sinon from "sinon";

import { ChannelCollection } from "../channelCollection.js";
import {
	ContainerRuntime,
	loadContainerRuntime,
	type IApplicationProjectionSummary,
	type ISummaryGenerationContext,
	type ISummaryGenerationOptions,
} from "../containerRuntime.js";
import { GarbageCollector } from "../gc/index.js";
import { neverCancelledSummaryToken, type ISubmitSummaryOpResult } from "../summary/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Inject native adoption failures without exporting a test-only runtime API.
import { SummarizerNode } from "../summary/summarizerNode/summarizerNode.js";

/**
 * Verify factory-supplied summary controls independently of application seed loading: unconditional
 * full trees, transition to incremental generation after coordinated acceptance, and synchronous
 * application content beside .channels. Check parent correspondence, retry/late-ACK capture,
 * load-time option capture, placement/group IDs/statistics, and failure-before-upload/retry.
 */
describe("Runtime summary generation options", () => {
	let sandbox: Sinon.SinonSandbox;
	let runtimes: ContainerRuntime[];

	beforeEach(() => {
		sandbox = Sinon.createSandbox();
		runtimes = [];
	});

	afterEach(() => {
		for (const runtime of runtimes) {
			runtime.dispose();
		}
		sandbox.restore();
	});

	/**
	 * Load a real ContainerRuntime through the application-facing API with controlled storage and op submission.
	 * The returned spies distinguish generation, upload, and submit failures; suite cleanup disposes the runtime.
	 */
	async function createRuntime(
		summaryGenerationOptions?: ISummaryGenerationOptions,
		attachState = AttachState.Attached,
		loadedParent?: { id: string; sequenceNumber: number },
	): Promise<{
		runtime: ContainerRuntime;
		logger: ReturnType<typeof createChildLogger>;
		uploadSummary: Sinon.SinonStub<
			Parameters<IContainerStorageService["uploadSummaryWithContext"]>,
			ReturnType<IContainerStorageService["uploadSummaryWithContext"]>
		>;
		submitSummary: Sinon.SinonStub<[], number>;
		deltaManager: MockDeltaManager;
		close: Sinon.SinonSpy;
		storage: Partial<IContainerStorageService>;
	}> {
		const logger = createChildLogger({ logger: new MockLogger() });
		const deltaManager = new MockDeltaManager();
		deltaManager.initialSequenceNumber = loadedParent?.sequenceNumber ?? 0;
		deltaManager.lastSequenceNumber = deltaManager.initialSequenceNumber;
		deltaManager.lastMessage = {
			clientId: "client",
			type: MessageType.Operation,
			sequenceNumber: deltaManager.lastSequenceNumber,
			timestamp: Date.now(),
			minimumSequenceNumber: 0,
			referenceSequenceNumber: 0,
			clientSequenceNumber: 0,
			contents: undefined,
		};
		const uploadSummary = sandbox
			.stub<
				Parameters<IContainerStorageService["uploadSummaryWithContext"]>,
				ReturnType<IContainerStorageService["uploadSummaryWithContext"]>
			>()
			.resolves("summary-handle");
		const submitSummary = sandbox.stub<[], number>().returns(1);
		const close = sandbox.spy();
		const storage: Partial<IContainerStorageService> = {
			uploadSummaryWithContext: uploadSummary,
		};
		const context: Partial<IContainerContext> = {
			attachState,
			deltaManager,
			audience: new MockAudience(),
			quorum: new MockQuorumClients(),
			taggedLogger: logger,
			clientDetails: { capabilities: { interactive: true } },
			clientId: "client",
			connected: attachState === AttachState.Attached,
			closeFn: close,
			updateDirtyContainerState: () => {},
			getLoadedFromVersion: () =>
				loadedParent === undefined ? undefined : { id: loadedParent.id, treeId: "tree" },
			submitSummaryFn: submitSummary,
			storage: storage as IContainerStorageService,
		};
		// Exercise the application factory API, not a subclass or private runtime mutation.
		const runtime = await loadContainerRuntime({
			context: context as IContainerContext,
			registryEntries: [],
			existing: false,
			provideEntryPoint: async () => ({}),
			summaryGenerationOptions,
		});
		assert(runtime instanceof ContainerRuntime);
		runtimes.push(runtime);
		return { runtime, logger, uploadSummary, submitSummary, deltaManager, close, storage };
	}

	/** Create a fresh grouped application subtree so callback freshness, placement, and stats can be compared. */
	function additionalTree(content = "checkpoint"): ISummaryTree {
		return {
			type: SummaryType.Tree,
			groupId: "application-group",
			tree: {
				state: { type: SummaryType.Blob, content },
			},
		};
	}

	const untrackedSummary = { trackState: false, runGC: false };

	/** Submit through the real runtime so native and GC pending state are completed under the uploaded handle. */
	async function submit(
		fixture: Awaited<ReturnType<typeof createRuntime>>,
		fullTree = false,
	): Promise<ISubmitSummaryOpResult> {
		const result = await fixture.runtime.submitSummary({
			summaryLogger: fixture.logger,
			cancellationToken: neverCancelledSummaryToken,
			latestSummaryRefSeqNum: 0,
			fullTree,
		});
		if (result.stage !== "submit") {
			assert.fail(result.error?.message ?? `Summary stopped at ${result.stage}`);
		}
		return result;
	}

	/** Deliver the ACK through coordinated native/GC adoption, not a raw summary-success event. */
	async function accept(
		fixture: Awaited<ReturnType<typeof createRuntime>>,
		proposalHandle: string,
		referenceSequenceNumber = fixture.deltaManager.lastSequenceNumber,
	): Promise<void> {
		await fixture.runtime.refreshLatestSummaryAck({
			proposalHandle,
			ackHandle: `ack-${proposalHandle}`,
			summaryRefSeq: referenceSequenceNumber,
			summaryLogger: fixture.logger,
		});
	}

	// Generated or uploaded content is not yet a usable native baseline. Each retry must remain full.
	it("keeps retries full until a tracked ACK adopts the native and GC baseline", async () => {
		const channels = sandbox.spy(ChannelCollection.prototype, "summarize");
		const gc = sandbox.spy(GarbageCollector.prototype, "summarize");
		const contexts: ISummaryGenerationContext[] = [];
		const accepted: ISummaryContext[] = [];
		const fixture = await createRuntime({
			fullTreeUntilFirstAck: true,
			additionalRootTree: {
				key: "application",
				summarize: (context) => {
					contexts.push(context);
					return {
						summary: additionalTree(),
						onAccepted: (parent) => {
							accepted.push(parent);
						},
					};
				},
			},
		});
		await fixture.runtime.summarize(untrackedSummary);
		await fixture.runtime.summarize({ fullTree: true, runGC: false });
		fixture.uploadSummary.onFirstCall().rejects(new Error("Upload rejected"));
		const options = {
			summaryLogger: fixture.logger,
			cancellationToken: neverCancelledSummaryToken,
			latestSummaryRefSeqNum: 0,
		};
		const failedUpload = await fixture.runtime.submitSummary(options);
		assert.equal(failedUpload.stage, "generate");
		fixture.uploadSummary.onSecondCall().resolves("unsubmitted");
		fixture.submitSummary.onFirstCall().throws(new Error("Submit rejected"));
		const failedSubmit = await fixture.runtime.submitSummary(options);
		assert.equal(failedSubmit.stage, "upload");
		await accept(fixture, "unsubmitted");
		await accept(fixture, "remote");
		assert.equal(accepted.length, 0);
		fixture.uploadSummary.onThirdCall().resolves("baseline");
		await submit(fixture);
		assert.equal(accepted.length, 0);
		assert(contexts.every((context) => context.fullTree));
		await accept(fixture, "baseline");
		assert.deepEqual(accepted, [
			{
				proposalHandle: "baseline",
				ackHandle: "ack-baseline",
				referenceSequenceNumber: 0,
			},
		]);
		fixture.uploadSummary.onCall(3).resolves("incremental");
		const incremental = await submit(fixture);
		assert.equal(channels.lastCall.args[0], false);
		assert.equal(gc.lastCall.args[0], false);
		assert.equal(incremental.summaryTree.tree.gc?.type, SummaryType.Handle);
		assert.equal(contexts.at(-1)?.previousSummary, accepted[0]);
		assert.equal(fixture.uploadSummary.lastCall.args[1].ackHandle, "ack-baseline");
		assert.deepEqual(
			channels.getCalls().map((call) => call.args[0]),
			[true, true, true, true, true, false],
		);
		await accept(fixture, "baseline");
		assert.equal(accepted.length, 1, "Duplicate ACK must not repeat application promotion");
	});

	// Acceptance is coordinated: neither callbacks nor incremental generation may run while GC refresh is pending.
	it("waits for GC adoption before promoting application state and enabling incremental summaries", async () => {
		const gate = new Deferred<void>();
		const started = new Deferred<void>();
		const refreshGC = GarbageCollector.prototype.refreshLatestSummary;
		sandbox.stub(GarbageCollector.prototype, "refreshLatestSummary").callsFake(async function (
			this: GarbageCollector,
			result,
			proposalHandle,
		) {
			started.resolve();
			await gate.promise;
			await refreshGC.call(this, result, proposalHandle);
		});
		const onAccepted = sandbox.spy();
		const fixture = await createRuntime({
			fullTreeUntilFirstAck: true,
			additionalRootTree: {
				key: "application",
				summarize: () => ({ summary: additionalTree(), onAccepted }),
			},
		});
		await submit(fixture);
		const acceptance = accept(fixture, "summary-handle");
		await started.promise;
		assert.equal(onAccepted.callCount, 0);
		await assert.rejects(
			fixture.runtime.summarize(untrackedSummary),
			/during summary acceptance/,
		);
		gate.resolve();
		await acceptance;
		assert.equal(onAccepted.callCount, 1);
		const next = await submit(fixture);
		assert.equal(next.summaryTree.tree.gc?.type, SummaryType.Handle);
	});

	// A newer untracked ACK can refresh the storage cache, but never supplies this runtime's accepted baseline.
	it("stays full after a newer remote ACK whose snapshot cannot be adopted", async () => {
		const channels = sandbox.spy(ChannelCollection.prototype, "summarize");
		const onAccepted = sandbox.spy();
		const fixture = await createRuntime({
			fullTreeUntilFirstAck: true,
			additionalRootTree: {
				key: "application",
				summarize: () => ({ summary: additionalTree(), onAccepted }),
			},
		});
		fixture.storage.getVersions = async () => [{ id: "older-snapshot", treeId: "tree" }];
		fixture.storage.getSnapshotTree = async () => ({
			blobs: {},
			trees: {
				".protocol": { blobs: { attributes: "attributes" }, trees: {} },
			},
		});
		fixture.storage.readBlob = async () =>
			new TextEncoder().encode(JSON.stringify({ sequenceNumber: 0 })).buffer;
		await accept(fixture, "remote", 10);
		assert.equal(onAccepted.callCount, 0);
		assert.equal(fixture.close.callCount, 0);
		await submit(fixture);
		assert.equal(channels.lastCall.args[0], true);
		assert.equal(fixture.uploadSummary.lastCall.args[1].ackHandle, undefined);
	});

	// A partial native/GC refresh cannot be retried safely as though no adoption had happened.
	for (const phase of ["native", "GC"]) {
		it(`fails closed if ${phase} adoption fails without promoting the application callback`, async () => {
			if (phase === "native") {
				sandbox
					.stub(SummarizerNode.prototype, "refreshLatestSummary")
					.rejects(new Error("Native adoption failed"));
			} else {
				sandbox
					.stub(GarbageCollector.prototype, "refreshLatestSummary")
					.rejects(new Error("GC adoption failed"));
			}
			const onAccepted = sandbox.spy();
			const fixture = await createRuntime({
				fullTreeUntilFirstAck: true,
				additionalRootTree: {
					key: "application",
					summarize: () => ({ summary: additionalTree(), onAccepted }),
				},
			});
			await submit(fixture);
			await assert.rejects(accept(fixture, "summary-handle"), /adoption failed/);
			assert.equal(onAccepted.callCount, 0);
			assert.equal(fixture.close.callCount, 1);
			await assert.rejects(fixture.runtime.summarize(untrackedSummary), /adoption failed/);
		});
	}

	// A later attempt or current edits must not overwrite the captured callback of a timed-out proposal.
	it("promotes the matching proposal after a later attempt and untracked generation", async () => {
		let revision = 1;
		const promoted: { revision: number; parent: ISummaryContext }[] = [];
		const fixture = await createRuntime({
			fullTreeUntilFirstAck: true,
			additionalRootTree: {
				key: "application",
				summarize: () => {
					const capturedRevision = revision;
					return {
						summary: additionalTree(String(capturedRevision)),
						onAccepted: (parent) => {
							promoted.push({ revision: capturedRevision, parent });
						},
					};
				},
			},
		});
		fixture.uploadSummary.onFirstCall().resolves("first");
		fixture.uploadSummary.onSecondCall().resolves("second");
		await submit(fixture);
		revision = 2;
		assert(fixture.deltaManager.lastMessage !== undefined);
		fixture.deltaManager.lastSequenceNumber = 1;
		fixture.deltaManager.lastMessage = {
			...fixture.deltaManager.lastMessage,
			sequenceNumber: 1,
		};
		await submit(fixture);
		revision = 3;
		await fixture.runtime.summarize(untrackedSummary);
		await accept(fixture, "first", 0);
		assert.deepEqual(
			promoted.map((entry) => entry.revision),
			[1],
		);
		await accept(fixture, "first", 0);
		assert.equal(promoted.length, 1);
		await accept(fixture, "second");
		assert.deepEqual(
			promoted.map((entry) => entry.revision),
			[1, 2],
		);
	});

	// Both unconditional load-time policy and an individual fullTree request continue to override incremental reuse.
	for (const forceFullTree of [false, true]) {
		it(`respects explicit full-tree requests after adoption (forceFullTree ${forceFullTree})`, async () => {
			const channels = sandbox.spy(ChannelCollection.prototype, "summarize");
			const fixture = await createRuntime({ fullTreeUntilFirstAck: true, forceFullTree });
			await submit(fixture);
			await accept(fixture, "summary-handle");
			await submit(fixture, true);
			assert.equal(channels.lastCall.args[0], true);
			await submit(fixture);
			assert.equal(channels.lastCall.args[0], forceFullTree);
		});
	}

	// The loaded parent checkpoint is stable as ops advance; attach has no prior summary against which to reuse.
	it("reports effective generation context and the original loaded parent", async () => {
		const contexts: ISummaryGenerationContext[] = [];
		const fixture = await createRuntime(
			{
				fullTreeUntilFirstAck: true,
				additionalRootTree: {
					key: "application",
					summarize: (context) => {
						contexts.push(context);
						return { summary: additionalTree() };
					},
				},
			},
			AttachState.Attached,
			{ id: "loaded-parent", sequenceNumber: 10 },
		);
		fixture.deltaManager.lastSequenceNumber = 12;
		await fixture.runtime.summarize(untrackedSummary);
		assert.deepEqual(contexts[0], {
			fullTree: true,
			trackState: false,
			referenceSequenceNumber: 12,
			previousSummary: {
				proposalHandle: undefined,
				ackHandle: "loaded-parent",
				referenceSequenceNumber: 10,
			},
		});
		fixture.runtime.createSummary();
		assert.equal(contexts[1].previousSummary, undefined);
		assert.equal(contexts[1].trackState, false);
		assert.equal(contexts[1].fullTree, true);
	});

	// Native adoption cannot be rolled back. Failed/async promotion must close rather than allow unsafe reuse.
	for (const asynchronous of [false, true]) {
		it(`fails closed on ${asynchronous ? "async" : "throwing"} acceptance callbacks`, async () => {
			const onAccepted = sandbox.spy(
				asynchronous
					? async () => {}
					: () => {
							throw new Error("Cannot promote checkpoint");
						},
			);
			const fixture = await createRuntime({
				fullTreeUntilFirstAck: true,
				additionalRootTree: {
					key: "application",
					summarize: () => ({
						summary: additionalTree(),
						// eslint-disable-next-line @typescript-eslint/no-misused-promises -- Exercise rejection of an intentionally async acceptance callback.
						onAccepted,
					}),
				},
			});
			await submit(fixture);
			await assert.rejects(
				accept(fixture, "summary-handle"),
				asynchronous ? /must be synchronous/ : /Cannot promote checkpoint/,
			);
			assert.equal(fixture.close.callCount, 1);
			await assert.rejects(fixture.runtime.summarize(untrackedSummary));
			await assert.rejects(accept(fixture, "summary-handle"));
			assert.equal(onAccepted.callCount, 1);
		});
	}

	for (const forceFullTree of [undefined, false, true]) {
		// Compare caller requests with the lifetime override at both native data-store and GC boundaries.
		it(`propagates fullTree to native data stores and GC (load option ${forceFullTree})`, async () => {
			const channels = sandbox.spy(ChannelCollection.prototype, "summarize");
			const gc = sandbox.spy(GarbageCollector.prototype, "summarize");
			const { runtime } = await createRuntime(
				forceFullTree === undefined ? undefined : { forceFullTree },
			);
			for (const requestedFullTree of [undefined, false, true, false]) {
				await runtime.summarize({ ...untrackedSummary, fullTree: requestedFullTree });
				const expected = forceFullTree === true || requestedFullTree === true;
				assert.equal(channels.lastCall.args[0], expected);
				assert.equal(gc.lastCall.args[0], expected);
			}
			assert.equal(channels.callCount, 4);
			assert.equal(gc.callCount, 4);
		});
	}

	// Mutating the caller-owned configuration after loading must not replace a validated registration or policy.
	it("retains the load-time policy and registration even if the input object changes", async () => {
		const channels = sandbox.spy(ChannelCollection.prototype, "summarize");
		const summarize = sandbox.spy(() => ({ summary: additionalTree() }));
		const options = {
			forceFullTree: true,
			additionalRootTree: { key: "application", summarize },
		};
		const { runtime } = await createRuntime(options);
		options.forceFullTree = false;
		options.additionalRootTree.key = ".channels";
		options.additionalRootTree.summarize = sandbox.spy(() => {
			throw new Error("Replacement must not be called");
		});
		const { summary } = await runtime.summarize(untrackedSummary);
		assert.equal(channels.lastCall.args[0], true);
		assert.equal(summarize.callCount, 1);
		assert.deepEqual(summary.tree.application, additionalTree());
	});

	// Exercise submitSummary, not only direct summarize(), including a failed upload followed by a final retry.
	it("forces fullTree through the summarizer submission path and its retry", async () => {
		const channels = sandbox.spy(ChannelCollection.prototype, "summarize");
		const gc = sandbox.spy(GarbageCollector.prototype, "summarize");
		const summarize = sandbox.spy(() => ({ summary: additionalTree() }));
		const { runtime, logger, uploadSummary } = await createRuntime({
			forceFullTree: true,
			additionalRootTree: { key: "application", summarize },
		});
		uploadSummary.onFirstCall().rejects(new Error("Retry upload"));
		const options = {
			summaryLogger: logger,
			cancellationToken: neverCancelledSummaryToken,
			latestSummaryRefSeqNum: 0,
		};
		const failed = await runtime.submitSummary(options);
		assert.equal(failed.stage, "generate");
		const retried = await runtime.submitSummary({
			...options,
			fullTree: false,
			finalAttempt: true,
		});
		assert.equal(retried.stage, "submit");
		assert.deepEqual(
			channels.getCalls().map((call) => call.args[0]),
			[true, true],
		);
		assert.deepEqual(
			gc.getCalls().map((call) => call.args[0]),
			[true, true],
		);
		assert.equal(summarize.callCount, 2);
		for (const call of uploadSummary.getCalls()) {
			assert.deepEqual(call.args[0].tree.application, additionalTree());
		}
	});

	// The new callback is opt-in; neither attach nor normal summaries should gain application state by default.
	it("does not add a root subtree by default", async () => {
		const { runtime } = await createRuntime();
		assert.equal(runtime.createSummary().tree.application, undefined);
		const { summary } = await runtime.summarize(untrackedSummary);
		assert.equal(summary.tree.application, undefined);
	});

	for (const cleanupMethod of ["isSummaryInProgress", "clearSummary"]) {
		it(`emits summary telemetry when ${cleanupMethod} throws during cleanup`, async () => {
			const { runtime } = await createRuntime();
			const mockLogger = new MockLogger();
			const cleanupError = new Error("Summary cleanup failed");
			if (cleanupMethod === "isSummaryInProgress") {
				sandbox.stub(SummarizerNode.prototype, cleanupMethod).throws(cleanupError);
			} else {
				sandbox.stub(GarbageCollector.prototype, "clearSummary").throws(cleanupError);
			}
			await assert.rejects(
				runtime.summarize({
					...untrackedSummary,
					summaryLogger: createChildLogger({ logger: mockLogger }),
				}),
				(error: unknown) => error === cleanupError,
			);
			const events = mockLogger.events.filter(
				(event) => event.eventName === "SummarizeTelemetry",
			);
			assert.equal(events.length, 1);
			assert.equal(typeof events[0].details, "string");
			assert.notEqual(events[0].details, "{}");
		});
	}

	for (const includeManifest of [false, true]) {
		it(`accepts opaque application content at a chosen root (manifest ${includeManifest})`, async () => {
			const createProjection = (): ISummaryTree => {
				const projection = additionalTree("application-owned content");
				if (includeManifest) {
					projection.tree["manifest.json"] = {
						type: SummaryType.Blob,
						content: '{"chosenByApplication":true,"layoutRevision":"custom"}',
					};
				}
				return projection;
			};
			const expectedProjection = createProjection();
			const { runtime } = await createRuntime({
				additionalRootTree: {
					key: "readerContent",
					summarize: () => ({ summary: createProjection() }),
				},
			});
			const attached = runtime.createSummary();
			assert.deepEqual(attached.tree.readerContent, expectedProjection);
			assert.equal(attached.tree.applicationProjection, undefined);
			const { summary } = await runtime.summarize(untrackedSummary);
			assert.deepEqual(summary.tree.readerContent, expectedProjection);
			assert.equal(summary.tree.applicationProjection, undefined);
		});
	}

	// Each summary must get a fresh checkpoint-specific root sibling, not a one-time or DDS-nested projection.
	it("calls the callback synchronously for every attach and normal summary, preserving groupId", async () => {
		let checkpoint = 0;
		const summarize = sandbox.spy(() => ({ summary: additionalTree(String(++checkpoint)) }));
		const { runtime } = await createRuntime(
			{ additionalRootTree: { key: "application", summarize } },
			AttachState.Detached,
		);
		for (let attempt = 1; attempt <= 4; attempt++) {
			let summary: ISummaryTree;
			if (attempt <= 2) {
				summary = runtime.createSummary();
			} else {
				const result = await runtime.summarize(untrackedSummary);
				summary = result.summary;
			}
			assert.equal(summarize.callCount, attempt);
			assert.deepEqual(summary.tree.application, additionalTree(String(attempt)));
			const channels: SummaryObject | undefined = summary.tree[".channels"];
			assert(channels?.type === SummaryType.Tree);
			assert.equal(channels.tree.application, undefined);
		}
	});

	// Incremental reuse of native data must not bypass the application callback or omit its stats.
	it("calls the callback again when native descendants are handles", async () => {
		const nativeSummary: ISummaryTree = {
			type: SummaryType.Tree,
			tree: {
				store: {
					type: SummaryType.Handle,
					handleType: SummaryType.Tree,
					handle: "/.channels/store",
				},
			},
		};
		sandbox.stub(ChannelCollection.prototype, "summarize").callsFake(async () => ({
			summary: nativeSummary,
			stats: calculateStats(nativeSummary),
		}));
		const summarize = sandbox.spy(() => ({ summary: additionalTree() }));
		const { runtime } = await createRuntime({
			additionalRootTree: { key: "application", summarize },
		});
		for (let attempt = 1; attempt <= 2; attempt++) {
			const { summary, stats } = await runtime.summarize(untrackedSummary);
			assert.equal(summarize.callCount, attempt);
			assert.equal(summary.tree[".channels"], nativeSummary);
			assert.deepEqual(summary.tree.application, additionalTree());
			assert.equal(stats.handleNodeCount, 1);
			assert.deepEqual(stats, calculateStats(summary));
		}
	});

	// Summary accounting must include all projection descendants and actual encoded byte lengths.
	it("accounts for nested trees and both UTF-8 and binary blob sizes", async () => {
		const subtree = additionalTree("checkpoint \u{1F30D}");
		subtree.tree.nested = {
			type: SummaryType.Tree,
			tree: { binary: { type: SummaryType.Blob, content: new Uint8Array([1, 2, 3]) } },
		};
		const { runtime } = await createRuntime({
			additionalRootTree: { key: "application", summarize: () => ({ summary: subtree }) },
		});
		const { summary, stats } = await runtime.summarize(untrackedSummary);
		assert.deepEqual(stats, calculateStats(summary));
		assert.deepEqual(calculateStats(subtree), {
			treeNodeCount: 2,
			blobNodeCount: 2,
			handleNodeCount: 0,
			totalBlobSize: 18,
			unreferencedBlobSize: 0,
		});
	});

	for (const key of [
		"",
		".channels",
		".metadata",
		".aliases",
		".chunks",
		".recentBatchInfo",
		".electedSummarizer",
		".idCompressor",
		".blobs",
		".protocol",
		".app",
		".logTail",
		".serviceProtocol",
		".futureNativeEntry",
		"gc",
		"__proto__",
		"constructor",
		"prototype",
		"toString",
		"parent/child",
		"parent\\child",
		"a b",
		"percent%",
		"fragment#",
	]) {
		// Reject ambiguous/reserved registrations before invoking application code or generating any summary.
		it(`rejects reserved or invalid root key ${JSON.stringify(key)} at load time`, async () => {
			const summarize = sandbox.spy(() => ({ summary: additionalTree() }));
			await assert.rejects(
				createRuntime({ additionalRootTree: { key, summarize } }),
				/Invalid or reserved additional summary root key/,
			);
			assert.equal(summarize.callCount, 0);
		});
	}

	// A future native root entry added after load-time validation must still win over a colliding registration.
	it("rejects collisions with native root entries without overwriting or calling the callback", async () => {
		// Simulate a native entry added in a future runtime version after key validation.
		const nativeStatePrototype = ContainerRuntime.prototype as unknown as {
			addContainerStateToSummary: (summary: ISummaryTreeWithStats) => void;
		};
		const nativeState = sandbox
			.stub(nativeStatePrototype, "addContainerStateToSummary")
			.callsFake((summary: ISummaryTreeWithStats) => {
				addBlobToSummary(summary, "application", "native");
			});
		const summarize = sandbox.spy(() => ({ summary: additionalTree() }));
		const { runtime } = await createRuntime({
			additionalRootTree: { key: "application", summarize },
		});
		assert.throws(() => runtime.createSummary(), /collides with a native root entry/);
		await assert.rejects(
			runtime.summarize(untrackedSummary),
			/collides with a native root entry/,
		);
		assert.equal(nativeState.callCount, 2);
		assert.equal(summarize.callCount, 0);
	});

	// Neither summary entry point may swallow a failed projection or return success with missing app content.
	it("propagates callback failures from attach and normal summaries", async () => {
		const failure = new Error("Cannot read checkpoint");
		const { runtime } = await createRuntime({
			additionalRootTree: {
				key: "application",
				summarize: () => {
					throw failure;
				},
			},
		});
		assert.throws(
			() => runtime.createSummary(),
			(error) => error === failure,
		);
		await assert.rejects(runtime.summarize(untrackedSummary), (error) => error === failure);
	});

	// A projection error must abort before upload/submission; retry must run the callback again rather than reuse it.
	it("does not upload a failed callback's summary, and invokes it again on retry", async () => {
		let attempts = 0;
		const { runtime, logger, uploadSummary, submitSummary } = await createRuntime({
			additionalRootTree: {
				key: "application",
				summarize: () => {
					if (++attempts === 1) {
						throw new Error("Cannot read checkpoint");
					}
					return { summary: additionalTree() };
				},
			},
		});
		const options = {
			summaryLogger: logger,
			cancellationToken: neverCancelledSummaryToken,
			latestSummaryRefSeqNum: 0,
		};
		const failed = await runtime.submitSummary(options);
		assert.equal(failed.stage, "base");
		assert.match(failed.error?.message ?? "", /Cannot read checkpoint/);
		assert.equal(uploadSummary.callCount, 0);
		assert.equal(submitSummary.callCount, 0);
		const retried = await runtime.submitSummary(options);
		assert.equal(retried.stage, "submit");
		assert.equal(attempts, 2);
		assert.equal(uploadSummary.callCount, 1);
		assert.equal(submitSummary.callCount, 1);
	});

	// Runtime validation protects JS or mistyped callers from promises entering a synchronous summary contract.
	it("rejects async callbacks rather than silently emitting an incomplete subtree", async () => {
		const { runtime } = await createRuntime({
			additionalRootTree: {
				key: "application",
				// @ts-expect-error -- Async callbacks are intentionally unsupported, including at runtime.
				summarize: async () => ({ summary: additionalTree() }),
			},
		});
		assert.throws(() => runtime.createSummary(), /must synchronously return a tree/);
		await assert.rejects(
			runtime.summarize(untrackedSummary),
			/must synchronously return a tree/,
		);
	});

	// A promise with an otherwise-valid tree property is still asynchronous, including for JavaScript callers.
	it("rejects thenable results even if they also expose a summary tree", async () => {
		const { runtime } = await createRuntime({
			additionalRootTree: {
				key: "application",
				summarize: (): IApplicationProjectionSummary =>
					Object.assign(Promise.resolve(), { summary: additionalTree() }),
			},
		});
		assert.throws(() => runtime.createSummary(), /must synchronously return a tree/);
		await assert.rejects(
			runtime.summarize(untrackedSummary),
			/must synchronously return a tree/,
		);
	});

	// Application code must honor the effective policy; invalid handles cannot escape into an uploaded summary.
	for (const fullTreeUntilFirstAck of [false, true]) {
		it(`rejects application handles without a reusable parent (full policy ${fullTreeUntilFirstAck})`, async () => {
			const { runtime } = await createRuntime({
				fullTreeUntilFirstAck,
				additionalRootTree: {
					key: "application",
					summarize: () => ({
						summary: {
							type: SummaryType.Tree,
							tree: {
								part: {
									type: SummaryType.Handle,
									handleType: SummaryType.Tree,
									handle: "/application/part",
								},
							},
						},
					}),
				},
			});
			assert.throws(() => runtime.createSummary(), /handles require an incremental attempt/);
			await assert.rejects(
				runtime.summarize(untrackedSummary),
				/handles require an incremental attempt/,
			);
		});
	}
});

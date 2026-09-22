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
import {
	SummaryType,
	type ISummaryTree,
	type SummaryObject,
} from "@fluidframework/driver-definitions";
import { MessageType } from "@fluidframework/driver-definitions/internal";
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
	type ExperimentalSummaryOptions,
} from "../containerRuntime.js";
import { GarbageCollector } from "../gc/index.js";
import { neverCancelledSummaryToken } from "../summary/index.js";

// Verify opt-in summary contracts in the runtime itself, independent of the seed reference's app and service.
describe("Experimental runtime summaries", () => {
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
		experimentalSummaryOptions?: ExperimentalSummaryOptions,
		attachState = AttachState.Attached,
	): Promise<{
		runtime: ContainerRuntime;
		logger: ReturnType<typeof createChildLogger>;
		uploadSummary: Sinon.SinonStub<
			Parameters<IContainerStorageService["uploadSummaryWithContext"]>,
			ReturnType<IContainerStorageService["uploadSummaryWithContext"]>
		>;
		submitSummary: Sinon.SinonStub<[], number>;
	}> {
		const logger = createChildLogger({ logger: new MockLogger() });
		const deltaManager = new MockDeltaManager();
		deltaManager.lastMessage = {
			clientId: "client",
			type: MessageType.Operation,
			sequenceNumber: 0,
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
			closeFn: () => {},
			updateDirtyContainerState: () => {},
			getLoadedFromVersion: () => undefined,
			submitSummaryFn: submitSummary,
			storage: storage as IContainerStorageService,
		};
		// Exercise the application factory API, not a subclass or private runtime mutation.
		const runtime = await loadContainerRuntime({
			context: context as IContainerContext,
			registryEntries: [],
			existing: false,
			provideEntryPoint: async () => ({}),
			experimentalSummaryOptions,
		});
		assert(runtime instanceof ContainerRuntime);
		runtimes.push(runtime);
		return { runtime, logger, uploadSummary, submitSummary };
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
		const summarize = sandbox.spy(() => additionalTree());
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
		const summarize = sandbox.spy(() => additionalTree());
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

	// Each summary must get a fresh checkpoint-specific root sibling, not a one-time or DDS-nested projection.
	it("calls the callback synchronously for every attach and normal summary, preserving groupId", async () => {
		let checkpoint = 0;
		const summarize = sandbox.spy(() => additionalTree(String(++checkpoint)));
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
		const summarize = sandbox.spy(() => additionalTree());
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
			additionalRootTree: { key: "application", summarize: () => subtree },
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
			const summarize = sandbox.spy(() => additionalTree());
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
		const summarize = sandbox.spy(() => additionalTree());
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
					return additionalTree();
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
				summarize: async () => additionalTree(),
			},
		});
		assert.throws(() => runtime.createSummary(), /must synchronously return a tree/);
		await assert.rejects(
			runtime.summarize(untrackedSummary),
			/must synchronously return a tree/,
		);
	});
});

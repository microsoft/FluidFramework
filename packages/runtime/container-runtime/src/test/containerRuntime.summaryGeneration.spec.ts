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
import { SummaryType } from "@fluidframework/driver-definitions";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import { createChildLogger, MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	MockAudience,
	MockDeltaManager,
	MockQuorumClients,
} from "@fluidframework/test-runtime-utils/internal";
import Sinon from "sinon";

import { ChannelCollection } from "../channelCollection.js";
import { ContainerRuntime, loadContainerRuntime } from "../containerRuntime.js";
import { GarbageCollector } from "../gc/index.js";
import {
	neverCancelledSummaryToken,
	type ISubmitSummaryOpResult,
	type ISummaryGenerationOptions,
} from "../summary/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Inject native adoption failures without exporting test-only APIs.
import { SummarizerNode } from "../summary/summarizerNode/summarizerNode.js";

describe("Runtime summary generation options", () => {
	let sandbox: Sinon.SinonSandbox;
	let runtimes: ContainerRuntime[];

	beforeEach(() => {
		sandbox = Sinon.createSandbox();
		runtimes = [];
	});

	afterEach(() => {
		for (const runtime of runtimes) runtime.dispose();
		sandbox.restore();
	});

	async function createRuntime(summaryGenerationOptions?: ISummaryGenerationOptions) {
		const logger = createChildLogger({ logger: new MockLogger() });
		const deltaManager = new MockDeltaManager();
		deltaManager.initialSequenceNumber = 0;
		deltaManager.lastSequenceNumber = 0;
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
		const close = sandbox.spy();
		const storage: Partial<IContainerStorageService> = {
			uploadSummaryWithContext: uploadSummary,
		};
		const context: Partial<IContainerContext> = {
			attachState: AttachState.Attached,
			deltaManager,
			audience: new MockAudience(),
			quorum: new MockQuorumClients(),
			taggedLogger: logger,
			clientDetails: { capabilities: { interactive: true } },
			clientId: "client",
			connected: true,
			closeFn: close,
			updateDirtyContainerState: () => {},
			getLoadedFromVersion: () => undefined,
			submitSummaryFn: submitSummary,
			storage: storage as IContainerStorageService,
		};
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

	const untrackedSummary = { trackState: false, runGC: false };

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

	for (const fullTreePolicy of [undefined, "default", "untilFirstAck", "always"] as const) {
		it(`honors fullTree at data store and GC boundaries with policy ${fullTreePolicy}`, async () => {
			const channels = sandbox.spy(ChannelCollection.prototype, "summarize");
			const gc = sandbox.spy(GarbageCollector.prototype, "summarize");
			const { runtime } = await createRuntime(
				fullTreePolicy === undefined ? undefined : { fullTreePolicy },
			);
			assert.equal(runtime.shouldSummarizeOnStartup, fullTreePolicy === "untilFirstAck");
			for (const requestedFullTree of [undefined, false, true, false]) {
				await runtime.summarize({ ...untrackedSummary, fullTree: requestedFullTree });
				const expected =
					fullTreePolicy === "always" ||
					fullTreePolicy === "untilFirstAck" ||
					requestedFullTree === true;
				assert.equal(channels.lastCall.args[0], expected);
				assert.equal(gc.lastCall.args[0], expected);
			}
		});
	}

	it("rejects invalid JavaScript policy values", async () => {
		await assert.rejects(
			// @ts-expect-error -- Exercise the JavaScript caller boundary.
			createRuntime({ fullTreePolicy: "sometimes" }),
			/Invalid full-tree summary policy/,
		);
	});

	it("copies the policy before asynchronous loading", async () => {
		const options: { fullTreePolicy: ISummaryGenerationOptions["fullTreePolicy"] } = {
			fullTreePolicy: "always",
		};
		const loading = createRuntime(options);
		options.fullTreePolicy = "default";
		const { runtime } = await loading;
		const channels = sandbox.spy(ChannelCollection.prototype, "summarize");
		await runtime.summarize(untrackedSummary);
		assert.equal(channels.lastCall.args[0], true);
	});

	it("keeps failures and retries full until tracked native and GC adoption", async () => {
		const channels = sandbox.spy(ChannelCollection.prototype, "summarize");
		const fixture = await createRuntime({ fullTreePolicy: "untilFirstAck" });
		await fixture.runtime.summarize(untrackedSummary);
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
		assert.equal(fixture.runtime.shouldSummarizeOnStartup, true);
		fixture.uploadSummary.onThirdCall().resolves("baseline");
		const baseline = await submit(fixture);
		assert.equal(baseline.summaryStats.handleNodeCount, 0);
		assert.equal(fixture.runtime.shouldSummarizeOnStartup, true);
		await accept(fixture, "baseline");
		assert.equal(fixture.runtime.shouldSummarizeOnStartup, false);
		const incremental = await submit(fixture);
		assert.equal(incremental.summaryTree.tree.gc?.type, SummaryType.Handle);
		assert.equal(fixture.uploadSummary.lastCall.args[1].ackHandle, "ack-baseline");
		assert.deepEqual(
			channels.getCalls().map((call) => call.args[0]),
			[true, true, true, true, false],
		);
		await accept(fixture, "baseline");
		assert.equal(fixture.runtime.shouldSummarizeOnStartup, false);
	});

	it("blocks generation through GC adoption and queued duplicate acknowledgments", async () => {
		const started = new Deferred<void>();
		const gate = new Deferred<void>();
		const refreshGC = GarbageCollector.prototype.refreshLatestSummary;
		const gc = sandbox
			.stub(GarbageCollector.prototype, "refreshLatestSummary")
			.callsFake(async function (this: GarbageCollector, ...args) {
				started.resolve();
				await gate.promise;
				return refreshGC.apply(this, args);
			});
		const fixture = await createRuntime({ fullTreePolicy: "untilFirstAck" });
		await submit(fixture);
		const acceptance = accept(fixture, "summary-handle");
		const duplicate = accept(fixture, "summary-handle");
		await started.promise;
		assert.equal(fixture.runtime.shouldSummarizeOnStartup, true);
		await assert.rejects(
			fixture.runtime.summarize(untrackedSummary),
			/during summary acceptance/,
		);
		gate.resolve();
		await Promise.all([acceptance, duplicate]);
		assert.equal(gc.callCount, 1);
		const incremental = await submit(fixture);
		assert.equal(incremental.summaryTree.tree.gc?.type, SummaryType.Handle);
	});

	for (const phase of ["native", "GC"]) {
		it(`fails closed on ${phase} adoption failure`, async () => {
			if (phase === "native") {
				sandbox
					.stub(SummarizerNode.prototype, "refreshLatestSummary")
					.rejects(new Error("Native adoption failed"));
			} else {
				sandbox
					.stub(GarbageCollector.prototype, "refreshLatestSummary")
					.rejects(new Error("GC adoption failed"));
			}
			const fixture = await createRuntime({ fullTreePolicy: "untilFirstAck" });
			await submit(fixture);
			await assert.rejects(accept(fixture, "summary-handle"), /adoption failed/);
			assert.equal(fixture.close.callCount, 1);
			assert.equal(fixture.runtime.shouldSummarizeOnStartup, true);
			await assert.rejects(fixture.runtime.summarize(untrackedSummary), /adoption failed/);
			await assert.rejects(accept(fixture, "summary-handle"), /adoption failed/);
		});
	}

	it("fails closed on an acknowledgment with the wrong generated checkpoint", async () => {
		const fixture = await createRuntime({ fullTreePolicy: "untilFirstAck" });
		await submit(fixture);
		await assert.rejects(accept(fixture, "summary-handle", 1), /generated checkpoint/);
		assert.equal(fixture.close.callCount, 1);
		await assert.rejects(fixture.runtime.summarize(untrackedSummary), /generated checkpoint/);
	});

	it("keeps forcing after a newer untracked acknowledgment whose snapshot was rolled back", async () => {
		const fixture = await createRuntime({ fullTreePolicy: "untilFirstAck" });
		fixture.storage.getVersions = async () => [{ id: "older", treeId: "tree" }];
		fixture.storage.getSnapshotTree = async () => ({
			blobs: {},
			trees: { ".protocol": { blobs: { attributes: "attributes" }, trees: {} } },
		});
		fixture.storage.readBlob = async () =>
			new TextEncoder().encode(JSON.stringify({ sequenceNumber: 0 })).buffer;
		await accept(fixture, "remote", 10);
		assert.equal(fixture.close.callCount, 0);
		assert.equal(fixture.runtime.shouldSummarizeOnStartup, true);
		const full = await submit(fixture);
		assert.equal(full.summaryStats.handleNodeCount, 0);
	});

	it("adopts a delayed submitted proposal after newer generation and a failed retry", async () => {
		const fixture = await createRuntime({ fullTreePolicy: "untilFirstAck" });
		fixture.uploadSummary.onFirstCall().resolves("first");
		await submit(fixture);
		fixture.uploadSummary.onSecondCall().rejects(new Error("Upload rejected"));
		await assert.rejects(submit(fixture), /Upload rejected/);
		await fixture.runtime.summarize(untrackedSummary);
		await accept(fixture, "first");
		assert.equal(fixture.runtime.shouldSummarizeOnStartup, false);
		const incremental = await submit(fixture);
		assert.equal(incremental.summaryTree.tree.gc?.type, SummaryType.Handle);
	});

	for (const fullTreePolicy of ["default", "untilFirstAck", "always"] as const) {
		it(`honors explicit fullTree after adoption with policy ${fullTreePolicy}`, async () => {
			const channels = sandbox.spy(ChannelCollection.prototype, "summarize");
			const fixture = await createRuntime({ fullTreePolicy });
			await submit(fixture, true);
			await accept(fixture, "summary-handle");
			const full = await submit(fixture, true);
			assert.equal(full.summaryStats.handleNodeCount, 0);
			assert.equal(channels.lastCall.args[0], true);
			await submit(fixture);
			assert.equal(channels.lastCall.args[0], fullTreePolicy === "always");
		});
	}
});

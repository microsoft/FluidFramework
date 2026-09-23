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
import { SummaryType } from "@fluidframework/driver-definitions";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import { createChildLogger, MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	MockAudience,
	MockDeltaManager,
	MockQuorumClients,
} from "@fluidframework/test-runtime-utils/internal";
import Sinon from "sinon";

import { ContainerRuntime, loadContainerRuntime } from "../containerRuntime.js";
import { GarbageCollector } from "../gc/index.js";
import { neverCancelledSummaryToken, type ISubmitSummaryOpResult } from "../summary/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Inject cleanup failures without exporting a test-only runtime API.
import { SummarizerNode } from "../summary/summarizerNode/summarizerNode.js";

/**
 * Exercise GC proposal tracking through ordinary runtime summary generation, submission, and acknowledgment.
 * These tests use the runtime's existing summary options and do not require a custom runtime factory.
 */
describe("Runtime GC summary tracking", () => {
	let sandbox: Sinon.SinonSandbox;
	let runtimes: ContainerRuntime[];

	beforeEach(() => {
		sandbox = Sinon.createSandbox();
		runtimes = [];
	});

	afterEach(() => {
		sandbox.restore();
		for (const runtime of runtimes) {
			runtime.dispose();
		}
	});

	/**
	 * Load a real runtime with controlled summary storage and submission.
	 * Every created runtime is disposed after its test.
	 */
	async function createRuntime(): Promise<{
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
			.resolves("proposal");
		const submitSummary = sandbox.stub<[], number>().returns(1);
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
			closeFn: () => {},
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
		});
		assert(runtime instanceof ContainerRuntime);
		runtimes.push(runtime);
		return { runtime, logger, uploadSummary, submitSummary };
	}

	/**
	 * Submit a tracked summary and require it to reach the proposal-completion hooks.
	 */
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

	/**
	 * Route an acknowledgment through the runtime's existing summarizer-node correspondence check.
	 */
	async function accept(
		fixture: Awaited<ReturnType<typeof createRuntime>>,
		proposalHandle: string,
	): Promise<void> {
		await fixture.runtime.refreshLatestSummaryAck({
			proposalHandle,
			ackHandle: `ack-${proposalHandle}`,
			summaryRefSeq: 0,
			summaryLogger: fixture.logger,
		});
	}

	it("tracks a full summary and reuses its GC tree only after acknowledgment", async () => {
		const gcSummary = sandbox.spy(GarbageCollector.prototype, "summarize");
		const complete = sandbox.spy(GarbageCollector.prototype, "completeSummary");
		const fixture = await createRuntime();
		const first = await submit(fixture, true);
		assert.equal(first.summaryTree.tree.gc?.type, SummaryType.Tree);
		assert.deepEqual(gcSummary.lastCall.args.slice(0, 2), [true, true]);
		assert.deepEqual(complete.lastCall.args, ["proposal", 0]);

		// Generation and upload alone do not establish a reusable GC parent.
		fixture.uploadSummary.resolves("retry");
		const retry = await submit(fixture);
		assert.equal(retry.summaryTree.tree.gc?.type, SummaryType.Tree);
		await accept(fixture, "proposal");

		fixture.uploadSummary.resolves("incremental");
		const incremental = await submit(fixture);
		assert.equal(incremental.summaryTree.tree.gc?.type, SummaryType.Handle);
		assert.equal(fixture.uploadSummary.lastCall.args[1].ackHandle, "ack-proposal");

		// An explicit full-tree request still serializes blobs after accepting a reusable parent.
		fixture.uploadSummary.resolves("full-again");
		const fullAgain = await submit(fixture, true);
		assert.equal(fullAgain.summaryTree.tree.gc?.type, SummaryType.Tree);
	});

	it("keeps submitted GC proposals across direct summaries and failed retries", async () => {
		const complete = sandbox.spy(GarbageCollector.prototype, "completeSummary");
		const refresh = sandbox.spy(GarbageCollector.prototype, "refreshLatestSummary");
		const clear = sandbox.spy(GarbageCollector.prototype, "clearSummary");
		const fixture = await createRuntime();
		await submit(fixture, true);

		await fixture.runtime.summarize({ fullTree: true, trackState: false });
		assert.equal(complete.callCount, 1, "A direct summary must not create a pending proposal");
		fixture.uploadSummary.rejects(new Error("Upload failed"));
		const failed = await fixture.runtime.submitSummary({
			summaryLogger: fixture.logger,
			cancellationToken: neverCancelledSummaryToken,
			latestSummaryRefSeqNum: 0,
		});
		assert.equal(failed.stage, "generate");
		assert.equal(complete.callCount, 1, "A failed upload must not complete GC proposal state");
		assert(clear.callCount > 0, "Generation state must be cleared on exit");

		await accept(fixture, "remote");
		assert.equal(refresh.callCount, 0, "Untracked acknowledgments must not adopt GC state");
		await accept(fixture, "proposal");
		assert.equal(refresh.callCount, 1);
		assert.equal(refresh.lastCall.args[1], "proposal");
		await accept(fixture, "proposal");
		assert.equal(refresh.callCount, 1, "Duplicate acknowledgments must not adopt GC twice");

		fixture.uploadSummary.resolves("after-late-ack");
		const next = await submit(fixture);
		assert.equal(next.summaryTree.tree.gc?.type, SummaryType.Handle);
	});

	it("does not register GC state when summary submission is rejected", async () => {
		const complete = sandbox.spy(GarbageCollector.prototype, "completeSummary");
		const refresh = sandbox.spy(GarbageCollector.prototype, "refreshLatestSummary");
		const fixture = await createRuntime();
		fixture.submitSummary.throws(new Error("Submit failed"));
		const failed = await fixture.runtime.submitSummary({
			summaryLogger: fixture.logger,
			cancellationToken: neverCancelledSummaryToken,
			latestSummaryRefSeqNum: 0,
			fullTree: true,
		});
		assert.equal(failed.stage, "upload");
		assert.equal(complete.callCount, 0);
		await accept(fixture, "proposal");
		assert.equal(refresh.callCount, 0);

		fixture.submitSummary.returns(1);
		fixture.uploadSummary.resolves("retry");
		const retry = await submit(fixture);
		assert.equal(retry.summaryTree.tree.gc?.type, SummaryType.Tree);
	});

	for (const cleanupMethod of ["isSummaryInProgress", "clearSummary"] as const) {
		it(`emits full summary telemetry even when ${cleanupMethod} fails during cleanup`, async () => {
			const fixture = await createRuntime();
			const mockLogger = new MockLogger();
			const cleanupError = new Error("Summary cleanup failed");
			if (cleanupMethod === "isSummaryInProgress") {
				sandbox.stub(SummarizerNode.prototype, cleanupMethod).throws(cleanupError);
			} else {
				sandbox.stub(GarbageCollector.prototype, cleanupMethod).throws(cleanupError);
			}
			await assert.rejects(
				fixture.runtime.summarize({
					fullTree: true,
					trackState: false,
					runGC: false,
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
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// eslint-disable-next-line import-x/no-nodejs-modules -- Random bytes ensure compression still produces multiple chunks.
import * as crypto from "crypto";

import { describeCompat } from "@fluid-private/test-version-utils";
import { ConnectionState } from "@fluidframework/container-loader";
import {
	CompressionAlgorithms,
	type ContainerRuntime,
} from "@fluidframework/container-runtime/internal";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { SharedCounter } from "@fluidframework/counter/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	type ChannelFactoryRegistry,
	DataObjectFactoryType,
	getContainerEntryPointBackCompat,
	getRequiredPendingLocalState,
	type ITestContainerConfig,
	type ITestFluidObject,
	type ITestObjectProvider,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

// eslint-disable-next-line import-x/no-internal-modules -- Reuse the established offline-load harness rather than duplicating it.
import { loadContainerOffline } from "./offline/offlineTestsUtils.js";

describeCompat("Version marks", "NoCompat", function (getTestObjectProvider, apis) {
	const counterId = "exactlyOnceCounter";
	const registry: ChannelFactoryRegistry = [[counterId, apis.dds.SharedCounter.getFactory()]];
	let provider: ITestObjectProvider;
	const defaultTestContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
		runtimeOptions: { enableGroupedBatching: true },
	};

	before(function () {
		provider = getTestObjectProvider();
		if (provider.driver.type !== "local") {
			this.skip();
		}
	});

	const getTestContext = async (container: IContainer) => {
		const dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
		const containerRuntime = dataObject.context.containerRuntime as ContainerRuntime;
		const exactlyOnceCounter = await dataObject.getSharedObject<SharedCounter>(counterId);

		return { container, containerRuntime, sharedMap: dataObject.root, exactlyOnceCounter };
	};

	const createTestContext = async (
		testContainerConfig: ITestContainerConfig = defaultTestContainerConfig,
	) => {
		const context = await getTestContext(
			await provider.makeTestContainer(testContainerConfig),
		);

		const { container, sharedMap } = context;
		sharedMap.set("bootstrap", true);
		await waitForContainerConnection(container);
		await provider.ensureSynchronized();

		return context;
	};

	const loadTestContext = async (
		testContainerConfig: ITestContainerConfig = defaultTestContainerConfig,
	) => {
		const context = await getTestContext(
			await provider.loadTestContainer(testContainerConfig),
		);
		await waitForContainerConnection(context.container);
		await provider.ensureSynchronized();
		return context;
	};

	it("resolves a pending mark after its batch is sequenced", async () => {
		const { containerRuntime, sharedMap } = await createTestContext();
		const sequenceNumberBeforeEdit = containerRuntime.deltaManager.lastSequenceNumber;
		const sequencedBatches = new Map<string, number>();
		const unsubscribe = containerRuntime.versionMarkResolver.onBatchSequenced(
			(batchId, sequenceNumber) => {
				sequencedBatches.set(batchId, sequenceNumber);
			},
		);

		sharedMap.set("normalEdit", true);
		const mark = containerRuntime.versionMarkResolver.sealAndCaptureVersionMark();
		assert(mark.kind === "pending", "the unacknowledged edit should produce a pending mark");

		await provider.ensureSynchronized();
		unsubscribe();

		const resolved = await containerRuntime.versionMarkResolver.resolve(
			mark.batchId,
			mark.sequenceNumberLowerBound,
		);
		assert(
			resolved.kind === "resolved",
			"the mark should resolve after the edit is sequenced",
		);
		assert(
			resolved.sequenceNumber > sequenceNumberBeforeEdit,
			"the mark should resolve after the state captured before the edit",
		);
		assert.equal(
			sequencedBatches.get(mark.batchId),
			resolved.sequenceNumber,
			"the live sequencing notification should identify the resolved batch",
		);
		assert.equal(sharedMap.get("normalEdit"), true);
	});

	it("resolves a pending pre-edit mark after entering staging mode", async () => {
		const { containerRuntime, sharedMap } = await createTestContext();

		sharedMap.set("beforeStaging", true);
		const stageControls = containerRuntime.enterStagingMode();

		const preMark = containerRuntime.versionMarkResolver.sealAndCaptureVersionMark();
		assert(
			preMark.kind === "pending",
			"the unacknowledged pre-staging edit should produce a pending mark",
		);

		stageControls.commitChanges();
		await provider.ensureSynchronized();

		const resolved = await containerRuntime.versionMarkResolver.resolve(
			preMark.batchId,
			preMark.sequenceNumberLowerBound,
		);
		assert(
			resolved.kind === "resolved",
			"the pre-staging mark should resolve after its batch is sequenced",
		);
		assert.equal(sharedMap.get("beforeStaging"), true);
	});

	it("resolves a staged mark to the final staged batch", async () => {
		const { containerRuntime, sharedMap } = await createTestContext();
		const stageControls = containerRuntime.enterStagingMode();

		const preMark = containerRuntime.versionMarkResolver.sealAndCaptureVersionMark();
		assert(
			preMark.kind === "resolved",
			"a mark captured before any staged edits should resolve immediately",
		);
		assert.equal(
			preMark.sequenceNumber,
			containerRuntime.deltaManager.lastSequenceNumber,
			"the pre-edit mark should sit before the staged edits",
		);

		sharedMap.set("batchA", true);
		const batchAMark = containerRuntime.versionMarkResolver.sealAndCaptureVersionMark();
		assert(batchAMark.kind === "pending", "batch A should produce a pending mark");

		sharedMap.set("batchB", true);
		const postMark = containerRuntime.versionMarkResolver.sealAndCaptureVersionMark();
		assert(
			postMark.kind === "pending",
			"the final staged batch should produce a pending mark",
		);
		assert.notEqual(
			batchAMark.batchId,
			postMark.batchId,
			"the post-edit mark should identify the final staged batch",
		);

		stageControls.commitChanges();
		await provider.ensureSynchronized();

		const [resolvedA, resolvedPost] = await Promise.all([
			containerRuntime.versionMarkResolver.resolve(
				batchAMark.batchId,
				batchAMark.sequenceNumberLowerBound,
			),
			containerRuntime.versionMarkResolver.resolve(
				postMark.batchId,
				postMark.sequenceNumberLowerBound,
			),
		]);
		assert(resolvedA.kind === "resolved", "batch A's mark should resolve after commit");
		assert(resolvedPost.kind === "resolved", "the post-edit mark should resolve after commit");
		assert(
			resolvedA.sequenceNumber < resolvedPost.sequenceNumber,
			"the post-edit mark should resolve at the final staged batch",
		);

		assert.equal(sharedMap.get("batchA"), true);
		assert.equal(sharedMap.get("batchB"), true);
	});

	it("resolves a serialized locator from retained history in a fresh client", async () => {
		const { container, containerRuntime, sharedMap } = await createTestContext();
		const sequencedBatches = new Map<
			string,
			{ readonly sequenceNumber: number; readonly timestamp?: number }
		>();
		const unsubscribe = containerRuntime.versionMarkResolver.onBatchSequenced(
			(batchId, sequenceNumber, timestamp) => {
				sequencedBatches.set(batchId, { sequenceNumber, timestamp });
			},
		);

		sharedMap.set("retainedHistoryEdit", true);
		const mark = containerRuntime.versionMarkResolver.sealAndCaptureVersionMark();
		assert(mark.kind === "pending", "the edit should produce a pending mark");
		const serializedLocator = JSON.stringify(mark);

		await provider.ensureSynchronized();
		unsubscribe();

		const expected = sequencedBatches.get(mark.batchId);
		assert(expected !== undefined, "the creator should observe the captured batch sequencing");
		assert.equal(
			expected.sequenceNumber,
			containerRuntime.deltaManager.lastSequenceNumber,
			"the captured batch should end at the creator's exact final sequence number",
		);
		assert.notEqual(
			expected.timestamp,
			undefined,
			"the local service should provide the final op's server timestamp",
		);
		container.close();

		const freshContext = await loadTestContext();
		const locator = JSON.parse(serializedLocator) as typeof mark;
		assert(locator.kind === "pending", "the serialized locator should remain pending");
		const resolved = await freshContext.containerRuntime.versionMarkResolver.resolve(
			locator.batchId,
			locator.sequenceNumberLowerBound,
		);
		assert(resolved.kind === "resolved", "the fresh client should resolve from history");
		assert.deepEqual(
			resolved,
			{ kind: "resolved", ...expected },
			"history resolution should return the captured batch's exact final sequence and timestamp",
		);
		assert.equal(freshContext.sharedMap.get("retainedHistoryEdit"), true);
	});

	it("preserves a disconnected batch ID across reconnect and resolves it once", async () => {
		const creator = await createTestContext();
		const observer = await loadTestContext();
		const originalClientId = creator.container.clientId;
		assert(originalClientId !== undefined, "the creator should initially be connected");

		creator.container.disconnect();
		assert.equal(
			creator.container.connectionState,
			ConnectionState.Disconnected,
			"the creator should be disconnected",
		);
		creator.sharedMap.set("disconnectedBatchA", "A");
		creator.sharedMap.set("disconnectedBatchB", "B");
		creator.exactlyOnceCounter.increment(1);
		const mark = creator.containerRuntime.versionMarkResolver.sealAndCaptureVersionMark();
		assert(mark.kind === "pending", "the disconnected edits should produce a pending mark");

		const notifications: {
			readonly sequenceNumber: number;
			readonly timestamp?: number;
		}[] = [];
		const unsubscribe = observer.containerRuntime.versionMarkResolver.onBatchSequenced(
			(batchId, sequenceNumber, timestamp) => {
				if (batchId === mark.batchId) {
					notifications.push({ sequenceNumber, timestamp });
				}
			},
		);

		creator.container.connect();
		await waitForContainerConnection(creator.container);
		assert.notEqual(
			creator.container.clientId,
			originalClientId,
			"reconnect should use a new client identity",
		);
		await provider.ensureSynchronized();
		unsubscribe();

		assert.equal(
			notifications.length,
			1,
			"the observer should receive exactly one sequencing notification for the captured batch",
		);
		assert.equal(observer.sharedMap.get("disconnectedBatchA"), "A");
		assert.equal(observer.sharedMap.get("disconnectedBatchB"), "B");
		assert.equal(
			observer.exactlyOnceCounter.value,
			1,
			"the disconnected batch should be applied exactly once",
		);

		const expected = notifications[0];
		assert(expected !== undefined, "the captured batch should have one resolution");
		creator.container.close();
		observer.container.close();
		const freshContext = await loadTestContext();
		const resolved = await freshContext.containerRuntime.versionMarkResolver.resolve(
			mark.batchId,
			mark.sequenceNumberLowerBound,
		);
		assert(
			resolved.kind === "resolved",
			"a fresh client should resolve the resubmitted batch",
		);
		assert.deepEqual(
			resolved,
			{ kind: "resolved", ...expected },
			"the stable batch ID should resolve to its one sequenced occurrence",
		);
	});

	it("preserves a captured mark through pending-local-state rehydration", async () => {
		const creator = await createTestContext();
		const observer = await loadTestContext();
		const url = await provider.driver.createContainerUrl(
			provider.documentId,
			creator.container.resolvedUrl,
		);

		creator.container.disconnect();
		creator.sharedMap.set("rehydratedBatchA", "A");
		creator.sharedMap.set("rehydratedBatchB", "B");
		creator.exactlyOnceCounter.increment(1);
		const mark = creator.containerRuntime.versionMarkResolver.sealAndCaptureVersionMark();
		assert(mark.kind === "pending", "the offline edits should produce a pending mark");
		const pendingLocalState = await getRequiredPendingLocalState(creator.container);
		creator.container.close();
		await provider.ensureSynchronized();

		const rehydrated = await loadContainerOffline(
			defaultTestContainerConfig,
			provider,
			{ url },
			pendingLocalState,
		);
		const rehydratedContext = await getTestContext(rehydrated.container);
		const rehydratedMark =
			rehydratedContext.containerRuntime.versionMarkResolver.sealAndCaptureVersionMark();
		assert(
			rehydratedMark.kind === "pending",
			"the rehydrated pending batch should still be capturable",
		);
		assert.equal(
			rehydratedMark.batchId,
			mark.batchId,
			"rehydration should preserve the original captured batch identity",
		);
		assert.equal(
			rehydratedMark.sequenceNumberLowerBound,
			mark.sequenceNumberLowerBound,
			"rehydration should preserve the original history anchor",
		);

		const notifications: {
			readonly sequenceNumber: number;
			readonly timestamp?: number;
		}[] = [];
		const unsubscribe = observer.containerRuntime.versionMarkResolver.onBatchSequenced(
			(batchId, sequenceNumber, timestamp) => {
				if (batchId === mark.batchId) {
					notifications.push({ sequenceNumber, timestamp });
				}
			},
		);

		rehydrated.connect();
		await waitForContainerConnection(rehydrated.container);
		await provider.ensureSynchronized();
		unsubscribe();

		assert.equal(notifications.length, 1, "the rehydrated batch should sequence exactly once");
		assert.equal(observer.sharedMap.get("rehydratedBatchA"), "A");
		assert.equal(observer.sharedMap.get("rehydratedBatchB"), "B");
		assert.equal(
			observer.exactlyOnceCounter.value,
			1,
			"the rehydrated batch should be applied exactly once",
		);

		const expected = notifications[0];
		assert(expected !== undefined, "the rehydrated batch should have one resolution");
		rehydrated.container.close();
		observer.container.close();
		const freshContext = await loadTestContext();
		const resolved = await freshContext.containerRuntime.versionMarkResolver.resolve(
			mark.batchId,
			mark.sequenceNumberLowerBound,
		);
		assert(resolved.kind === "resolved", "a fresh client should resolve the rehydrated batch");
		assert.deepEqual(
			resolved,
			{ kind: "resolved", ...expected },
			"rehydration should retain the original mark's exact sequence and timestamp",
		);
	});

	it("resolves a genuinely compressed and chunked captured batch from history", async () => {
		const logger = new MockLogger();
		const testContainerConfig: ITestContainerConfig = {
			...defaultTestContainerConfig,
			loaderProps: { logger },
			runtimeOptions: {
				...defaultTestContainerConfig.runtimeOptions,
				compressionOptions: {
					minimumBatchSizeInBytes: 64,
					compressionAlgorithm: CompressionAlgorithms.lz4,
				},
				chunkSizeInBytes: 512,
			},
		};
		const creator = await createTestContext(testContainerConfig);
		logger.clear();
		const sequencedBatches = new Map<
			string,
			{ readonly sequenceNumber: number; readonly timestamp?: number }
		>();
		const unsubscribe = creator.containerRuntime.versionMarkResolver.onBatchSequenced(
			(batchId, sequenceNumber, timestamp) => {
				sequencedBatches.set(batchId, { sequenceNumber, timestamp });
			},
		);

		creator.sharedMap.set("compressedA", crypto.randomBytes(2048).toString("hex"));
		creator.sharedMap.set("compressedB", crypto.randomBytes(2048).toString("hex"));
		const mark = creator.containerRuntime.versionMarkResolver.sealAndCaptureVersionMark();
		assert(
			mark.kind === "pending",
			"the oversized grouped batch should produce a pending mark",
		);
		await provider.ensureSynchronized();
		unsubscribe();

		const chunkEvent = logger.events.find((event) =>
			event.eventName.endsWith("OpSplitter:CompressedChunkedBatch"),
		);
		assert(chunkEvent !== undefined, "the captured batch should emit chunking telemetry");
		assert(
			typeof chunkEvent.chunks === "number" && chunkEvent.chunks > 1,
			"the captured batch should be split into multiple compressed chunks",
		);
		const expected = sequencedBatches.get(mark.batchId);
		assert(expected !== undefined, "the creator should observe the chunked batch sequencing");
		assert(
			expected.sequenceNumber > mark.sequenceNumberLowerBound,
			"the final sequence number should follow at least one earlier chunk",
		);
		creator.container.close();

		const freshContext = await loadTestContext(testContainerConfig);
		const resolved = await freshContext.containerRuntime.versionMarkResolver.resolve(
			mark.batchId,
			mark.sequenceNumberLowerBound,
		);
		assert(
			resolved.kind === "resolved",
			"the fresh client should resolve the reassembled batch from retained history",
		);
		assert.deepEqual(
			resolved,
			{ kind: "resolved", ...expected },
			"chunked history resolution should return the exact final chunk sequence and timestamp",
		);
	});
});

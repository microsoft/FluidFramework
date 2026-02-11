/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type { IFluidCodeDetails } from "@fluidframework/container-definitions/internal";
import {
	asLegacyAlpha,
	createDetachedContainer,
	loadExistingContainer,
	loadSummarizerContainerAndMakeSummary,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import type { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import type { FluidObject } from "@fluidframework/core-interfaces/internal";
import type { LocalResolver } from "@fluidframework/local-driver/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import type { TestFluidObject } from "@fluidframework/test-utils/internal";

import { createLoader } from "../utils.js";

/**
 * Config provider that enables summarizeProtocolTree2 only.
 * Used for a "seed" summary that establishes the .app/.protocol snapshot structure
 * required by the local server for subsequent history-enabled summaries.
 */
const seedSettings: Record<string, ConfigTypes> = {
	"Fluid.Container.summarizeProtocolTree2": true,
};

const seedConfigProvider: IConfigProviderBase = {
	getRawConfig: (name: string) => seedSettings[name],
};

/**
 * Config provider that enables snapshot history with aggressive thresholds
 * (checkpoint on every summary) plus summarizeProtocolTree2.
 */
const historySettings: Record<string, ConfigTypes> = {
	"Fluid.Container.enableSnapshotHistory": true,
	"Fluid.Container.snapshotHistoryMinTime": 0,
	"Fluid.Container.snapshotHistoryMinOps": 0,
	"Fluid.Container.summarizeProtocolTree2": true,
};

const historyConfigProvider: IConfigProviderBase = {
	getRawConfig: (name: string) => historySettings[name],
};

/**
 * Helper: creates a container, attaches it, makes an edit, and does a seed summary
 * with summarizeProtocolTree2 to establish the .app/.protocol snapshot structure
 * that the local server needs for subsequent history-enabled summaries.
 *
 * Returns the entry point and URL for subsequent operations.
 */
async function createAttachAndSeedSummary(
	loaderProps: ILoaderProps,
	codeDetails: IFluidCodeDetails,
	urlResolver: LocalResolver,
): Promise<{
	container: Awaited<ReturnType<typeof createDetachedContainer>>;
	entryPoint: FluidObject<TestFluidObject>["ITestFluidObject"] & {};
	url: string;
}> {
	const container = await createDetachedContainer({
		...loaderProps,
		codeDetails,
		configProvider: seedConfigProvider,
	});
	const { ITestFluidObject: entryPoint }: FluidObject<TestFluidObject> =
		(await container.getEntryPoint()) ?? {};
	assert(entryPoint !== undefined, "Expected valid TestFluidObject entry point");

	await container.attach(urlResolver.createCreateNewRequest("test"));
	entryPoint.root.set("seed-key", "seed-value");

	const url = await container.getAbsoluteUrl("");
	assert(url !== undefined, "Expected container to have a URL");

	// Seed summary with summarizeProtocolTree2 to establish .app/.protocol
	// snapshot structure on the local server.
	const seedResult = await loadSummarizerContainerAndMakeSummary({
		...loaderProps,
		configProvider: seedConfigProvider,
		request: { url },
	});
	assert(seedResult.success, "Seed summary should succeed");

	return { container, entryPoint, url };
}

describe("Snapshot History", () => {
	it("checkpoints available after summary with history enabled", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const { loaderProps, codeDetails, urlResolver } = createLoader({
			deltaConnectionServer,
		});

		const { container, entryPoint, url } = await createAttachAndSeedSummary(
			loaderProps,
			codeDetails,
			urlResolver,
		);

		// Make edits and trigger summary with history enabled
		entryPoint.root.set("key1", "value1");
		const summaryResult = await loadSummarizerContainerAndMakeSummary({
			...loaderProps,
			configProvider: historyConfigProvider,
			request: { url },
		});
		assert(summaryResult.success, "History summary should succeed");

		// Load from new snapshot
		const container2 = await loadExistingContainer({
			...loaderProps,
			configProvider: historyConfigProvider,
			request: { url },
		});

		const history = asLegacyAlpha(container2).snapshotHistory;
		assert(history !== undefined, "Snapshot history should be available");

		const checkpoints = history.getCheckpoints();
		assert(checkpoints.length >= 1, "Should have at least 1 checkpoint");

		const checkpoint = checkpoints[0];
		assert(typeof checkpoint.seqNum === "number", "Checkpoint should have seqNum");
		assert(checkpoint.seqNum > 0, "Checkpoint seqNum should be positive");
		assert(typeof checkpoint.timestamp === "number", "Checkpoint should have timestamp");
		assert(checkpoint.timestamp > 0, "Checkpoint timestamp should be positive");
		assert(typeof checkpoint.groupId === "string", "Checkpoint should have groupId");
		assert(checkpoint.groupId.length > 0, "Checkpoint groupId should be non-empty");

		container.dispose();
		container2.dispose();
	});

	it("history not available when feature disabled", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const { loaderProps, codeDetails, urlResolver } = createLoader({
			deltaConnectionServer,
		});

		// No config provider → history feature disabled
		const container = await createDetachedContainer({
			...loaderProps,
			codeDetails,
		});
		const { ITestFluidObject: entryPoint }: FluidObject<TestFluidObject> =
			(await container.getEntryPoint()) ?? {};
		assert(entryPoint !== undefined, "Expected valid TestFluidObject entry point");

		await container.attach(urlResolver.createCreateNewRequest("test"));
		entryPoint.root.set("key1", "value1");

		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined, "Expected container to have a URL");

		// Trigger summary without history config
		const summaryResult = await loadSummarizerContainerAndMakeSummary({
			...loaderProps,
			request: { url },
		});
		assert(summaryResult.success, "Summary should succeed");

		// Load without history config
		const container2 = await loadExistingContainer({
			...loaderProps,
			request: { url },
		});

		const history = asLegacyAlpha(container2).snapshotHistory;
		assert(history === undefined, "Snapshot history should not be available when disabled");

		container.dispose();
		container2.dispose();
	});

	it("multiple summaries create multiple checkpoints", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const { loaderProps, codeDetails, urlResolver } = createLoader({
			deltaConnectionServer,
		});

		const { container, entryPoint, url } = await createAttachAndSeedSummary(
			loaderProps,
			codeDetails,
			urlResolver,
		);

		// First history summary
		entryPoint.root.set("round1-key", "round1-value");
		const result1 = await loadSummarizerContainerAndMakeSummary({
			...loaderProps,
			configProvider: historyConfigProvider,
			request: { url },
		});
		assert(result1.success, "First history summary should succeed");

		// Second history summary
		entryPoint.root.set("round2-key", "round2-value");
		const result2 = await loadSummarizerContainerAndMakeSummary({
			...loaderProps,
			configProvider: historyConfigProvider,
			request: { url },
		});
		assert(result2.success, "Second history summary should succeed");

		// Load and verify
		const container2 = await loadExistingContainer({
			...loaderProps,
			configProvider: historyConfigProvider,
			request: { url },
		});

		const history = asLegacyAlpha(container2).snapshotHistory;
		assert(history !== undefined, "Snapshot history should be available");

		const checkpoints = history.getCheckpoints();
		assert(checkpoints.length === 2, `Expected 2 checkpoints, got ${checkpoints.length}`);

		// Verify ascending sequence numbers
		assert(
			checkpoints[0].seqNum < checkpoints[1].seqNum,
			"Checkpoint seqNums should be ascending",
		);

		container.dispose();
		container2.dispose();
	});

	it("getClosestCheckpoint finds correct checkpoint", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const { loaderProps, codeDetails, urlResolver } = createLoader({
			deltaConnectionServer,
		});

		const { container, entryPoint, url } = await createAttachAndSeedSummary(
			loaderProps,
			codeDetails,
			urlResolver,
		);

		// First history summary
		entryPoint.root.set("round1-key", "round1-value");
		const result1 = await loadSummarizerContainerAndMakeSummary({
			...loaderProps,
			configProvider: historyConfigProvider,
			request: { url },
		});
		assert(result1.success, "First history summary should succeed");

		// Second history summary
		entryPoint.root.set("round2-key", "round2-value");
		const result2 = await loadSummarizerContainerAndMakeSummary({
			...loaderProps,
			configProvider: historyConfigProvider,
			request: { url },
		});
		assert(result2.success, "Second history summary should succeed");

		// Load and verify closest checkpoint logic
		const container2 = await loadExistingContainer({
			...loaderProps,
			configProvider: historyConfigProvider,
			request: { url },
		});

		const history = asLegacyAlpha(container2).snapshotHistory;
		assert(history !== undefined, "Snapshot history should be available");

		const checkpoints = history.getCheckpoints();
		assert(checkpoints.length === 2, `Expected 2 checkpoints, got ${checkpoints.length}`);

		const [cp1, cp2] = checkpoints;

		// Exact match on first checkpoint
		const exact1 = history.getClosestCheckpoint(cp1.seqNum);
		assert(exact1 !== undefined, "Should find exact match for first checkpoint");
		assert.strictEqual(exact1.seqNum, cp1.seqNum, "Should match first checkpoint seqNum");

		// Exact match on second checkpoint
		const exact2 = history.getClosestCheckpoint(cp2.seqNum);
		assert(exact2 !== undefined, "Should find exact match for second checkpoint");
		assert.strictEqual(exact2.seqNum, cp2.seqNum, "Should match second checkpoint seqNum");

		// SeqNum between the two checkpoints → should return the first one
		const between = history.getClosestCheckpoint(cp1.seqNum + 1);
		assert(between !== undefined, "Should find checkpoint between the two");
		assert.strictEqual(
			between.seqNum,
			cp1.seqNum,
			"Should return first checkpoint for seqNum between the two",
		);

		// SeqNum before any checkpoint → should return undefined
		const before = history.getClosestCheckpoint(0);
		assert(before === undefined, "Should return undefined for seqNum before all checkpoints");

		// SeqNum after all checkpoints → should return the last one
		const after = history.getClosestCheckpoint(cp2.seqNum + 1000);
		assert(after !== undefined, "Should find checkpoint for large seqNum");
		assert.strictEqual(
			after.seqNum,
			cp2.seqNum,
			"Should return last checkpoint for seqNum after all",
		);

		container.dispose();
		container2.dispose();
	});

	it("loadCheckpoint returns snapshot data for a checkpoint", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const { loaderProps, codeDetails, urlResolver } = createLoader({
			deltaConnectionServer,
		});

		const { container, entryPoint, url } = await createAttachAndSeedSummary(
			loaderProps,
			codeDetails,
			urlResolver,
		);

		// Make edits and trigger summary with history enabled
		entryPoint.root.set("key1", "value1");
		const summaryResult = await loadSummarizerContainerAndMakeSummary({
			...loaderProps,
			configProvider: historyConfigProvider,
			request: { url },
		});
		assert(summaryResult.success, "History summary should succeed");

		// Load from new snapshot
		const container2 = await loadExistingContainer({
			...loaderProps,
			configProvider: historyConfigProvider,
			request: { url },
		});

		const history = asLegacyAlpha(container2).snapshotHistory;
		assert(history !== undefined, "Snapshot history should be available");

		const checkpoints = history.getCheckpoints();
		assert(checkpoints.length >= 1, "Should have at least 1 checkpoint");

		const cpData = await history.loadCheckpoint(checkpoints[0]);
		assert.strictEqual(cpData.seqNum, checkpoints[0].seqNum, "seqNum should match");
		assert(cpData.snapshotTree !== undefined, "Should have a snapshot tree");
		assert(
			cpData.snapshotTree.trees[".app"] !== undefined,
			"Checkpoint should have .app subtree",
		);
		assert(
			cpData.snapshotTree.trees[".protocol"] !== undefined,
			"Checkpoint should have .protocol subtree",
		);
		assert(cpData.blobContents.size > 0, "Checkpoint should have blob contents");

		container.dispose();
		container2.dispose();
	});

	it("loadCheckpoint with multiple checkpoints loads distinct data", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const { loaderProps, codeDetails, urlResolver } = createLoader({
			deltaConnectionServer,
		});

		const { container, entryPoint, url } = await createAttachAndSeedSummary(
			loaderProps,
			codeDetails,
			urlResolver,
		);

		// First history summary
		entryPoint.root.set("round1-key", "round1-value");
		const result1 = await loadSummarizerContainerAndMakeSummary({
			...loaderProps,
			configProvider: historyConfigProvider,
			request: { url },
		});
		assert(result1.success, "First history summary should succeed");

		// Second history summary
		entryPoint.root.set("round2-key", "round2-value");
		const result2 = await loadSummarizerContainerAndMakeSummary({
			...loaderProps,
			configProvider: historyConfigProvider,
			request: { url },
		});
		assert(result2.success, "Second history summary should succeed");

		// Load and verify
		const container2 = await loadExistingContainer({
			...loaderProps,
			configProvider: historyConfigProvider,
			request: { url },
		});

		const history = asLegacyAlpha(container2).snapshotHistory;
		assert(history !== undefined, "Snapshot history should be available");

		const checkpoints = history.getCheckpoints();
		assert(checkpoints.length === 2, `Expected 2 checkpoints, got ${checkpoints.length}`);

		const cpData1 = await history.loadCheckpoint(checkpoints[0]);
		const cpData2 = await history.loadCheckpoint(checkpoints[1]);

		assert.strictEqual(cpData1.seqNum, checkpoints[0].seqNum, "First seqNum should match");
		assert.strictEqual(cpData2.seqNum, checkpoints[1].seqNum, "Second seqNum should match");
		assert(cpData1.seqNum !== cpData2.seqNum, "Checkpoints should have different seqNums");

		assert(
			cpData1.snapshotTree.trees[".app"] !== undefined,
			"First checkpoint should have .app subtree",
		);
		assert(
			cpData1.snapshotTree.trees[".protocol"] !== undefined,
			"First checkpoint should have .protocol subtree",
		);
		assert(
			cpData2.snapshotTree.trees[".app"] !== undefined,
			"Second checkpoint should have .app subtree",
		);
		assert(
			cpData2.snapshotTree.trees[".protocol"] !== undefined,
			"Second checkpoint should have .protocol subtree",
		);

		container.dispose();
		container2.dispose();
	});
});

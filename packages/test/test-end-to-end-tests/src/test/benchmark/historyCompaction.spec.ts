/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import {
	BenchmarkMode,
	benchmarkIt,
	currentBenchmarkMode,
	ValueType,
	type CollectedData,
} from "@fluid-tools/benchmark";
import { LoaderHeader, type IContainer } from "@fluidframework/container-definitions/internal";
import type { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions";
import {
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";
import {
	createSummarizer,
	DataObjectFactoryType,
	summarizeNow,
	waitForContainerConnection,
	type ITestContainerConfig,
	type ITestFluidObject,
} from "@fluidframework/test-utils/internal";
import {
	measureStoredHistory,
	measureSummarySize,
	type ISharedTree,
} from "@fluidframework/tree/internal/test";

type Commit = ReturnType<ISharedTree["kernel"]["getTrunkHead"]>;

function retainedCommits(tree: ISharedTree): Commit[] {
	const commits: Commit[] = [];
	for (
		let commit = tree.kernel.getTrunkHead();
		commit.parent !== undefined;
		commit = commit.parent
	) {
		commits.push(commit);
	}
	return commits.reverse();
}

function capturedMetadata(commits: Commit[]): unknown[] {
	const metadata: unknown[] = [];
	function visit(node: NonNullable<Commit["customMetadata"]>): void {
		if (node.metadata !== undefined) {
			metadata.push(node.metadata);
		}
		for (const child of node.children ?? []) {
			visit(child);
		}
	}
	for (const commit of commits) {
		if (commit.customMetadata !== undefined) {
			visit(commit.customMetadata);
		}
	}
	return metadata;
}

function compact(
	tree: ISharedTree,
	initialization: Commit[],
	workload: Commit[],
	acknowledgments: Commit[],
	groupSize: number,
): { durationMs: number; pairCount: number } {
	const endpoints: Commit[] = [];
	const pairs: [Commit, Commit][] = [];
	for (let start = 0; start < workload.length; start += groupSize) {
		let remaining = workload.slice(start, start + groupSize);
		while (remaining.length > 1) {
			const survivors: Commit[] = [];
			for (let index = 0; index < remaining.length; index += 2) {
				const older = remaining[index];
				const newer = remaining[index + 1];
				if (newer === undefined) {
					survivors.push(older);
				} else {
					pairs.push([older, newer]);
					survivors.push(newer);
				}
			}
			remaining = survivors;
		}
		endpoints.push(remaining[0]);
	}
	// Plan selection and verification are outside the timed production calls.
	const startTime = performance.now();
	for (const [older, newer] of pairs) {
		tree.kernel.compactHistory(older, newer);
	}
	const durationMs = performance.now() - startTime;
	assert.deepEqual(retainedCommits(tree), [
		...initialization,
		...endpoints,
		...acknowledgments,
	]);
	return { durationMs, pairCount: pairs.length };
}

function channelSummary(
	summary: ISummaryTree,
	dataStoreId: string,
	channelId: string,
): ISummaryTree {
	let subtree = summary;
	for (const key of [".channels", dataStoreId, ".channels", channelId]) {
		const child = subtree.tree[key];
		assert(child?.type === SummaryType.Tree, `Expected full summary tree at ${key}`);
		subtree = child;
	}
	return subtree;
}

describeCompat(
	"SharedTree history compaction summary size",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const { SchemaFactory, TreeViewConfiguration, TreeBeta, configuredSharedTree, asAlpha } =
			apis.dataRuntime.packages.tree;
		const sf = new SchemaFactory("history-compaction-benchmark");
		class Row extends sf.object("Row", { id: sf.number, value: sf.string }) {}
		class Rows extends sf.array("Rows", Row) {}
		class Document extends sf.object("Document", { rows: Rows, acknowledgment: sf.number }) {}
		const viewConfig = new TreeViewConfiguration({ schema: Document });
		const performanceMode = currentBenchmarkMode === BenchmarkMode.Performance;
		const rowCount = performanceMode ? 10_000 : 10;
		const opCount = performanceMode ? 1000 : 12;
		const groupSize = performanceMode ? 100 : 5;
		const payload = "document content ".repeat(8);
		const ids = ["uncompacted", "compacted"] as const;
		const factory = configuredSharedTree({
			retainHistory: true,
			minVersionForCollab: "3.14.0",
		}).getFactory();
		const config: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry: ids.map((id) => [id, factory]),
			runtimeOptions: {
				enableRuntimeIdCompressor: "on",
				summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
			},
		};

		for (const withMetadata of [false, true]) {
			const editMetadata = (index: number) => ({
				operation: "replace-value",
				editIndex: index,
				rowId: index % Math.min(rowCount, 32),
				note: "m".repeat(256),
			});
			const expectedMetadata = withMetadata
				? Array.from({ length: opCount }, (_, index) => editMetadata(index))
				: [];
			benchmarkIt({
				title: `basic content rows=${rowCount} ops=${opCount} group=${groupSize} retainHistory=true metadata=${withMetadata ? "256-byte-note" : "none"}`,
				run: async (): Promise<CollectedData> => {
					const provider = getTestObjectProvider({ syncSummarizer: true });
					const containers: IContainer[] = [];
					try {
						// Separate channels share the exact same service and collaboration context.
						const container = await provider.makeTestContainer(config);
						containers.push(container);
						await waitForContainerConnection(container);
						const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
						const trees = await Promise.all(
							ids.map(async (id) => dataObject.getSharedObject<ISharedTree>(id)),
						);
						const views = trees.map((tree) => asAlpha(tree.viewWith(viewConfig)));
						for (const view of views) {
							view.initialize({
								rows: Array.from({ length: rowCount }, (_, id) => ({ id, value: payload })),
								acknowledgment: 0,
							});
						}
						await provider.ensureSynchronized();
						const initialCounts = trees.map((tree) => retainedCommits(tree).length);
						assert.equal(initialCounts[0], initialCounts[1]);
						for (let index = 0; index < opCount; index++) {
							for (const view of views) {
								view.runTransaction(
									() => {
										view.root.rows[index % Math.min(rowCount, 32)].value =
											`${index}:${payload}`;
									},
									withMetadata ? { customMetadata: editMetadata(index) } : undefined,
								);
							}
						}
						await provider.ensureSynchronized();
						const workloadSequence = container.deltaManager.lastSequenceNumber;
						for (const [index, tree] of trees.entries()) {
							assert.equal(retainedCommits(tree).length, initialCounts[index] + opCount);
							assert.equal(tree.kernel.getLocalBranch().getHead(), tree.kernel.getTrunkHead());
						}

						const { container: summaryContainer, summarizer } = await createSummarizer(
							provider,
							container,
							{
								...config,
								runtimeOptions: {
									...config.runtimeOptions,
									summaryOptions: undefined,
								},
							},
						);
						containers.push(summaryContainer);
						await provider.ensureSynchronized();
						await summarizeNow(summarizer, {
							reason: "acknowledge uncompacted history",
							fullTree: true,
						});
						await provider.ensureSynchronized();
						// Deliver the newer collaboration boundary to each tree through real tree ops.
						let acknowledgmentCount = 0;
						for (let acknowledgment = 0; acknowledgment < 10; acknowledgment++) {
							for (const view of views) {
								view.root.acknowledgment++;
							}
							acknowledgmentCount++;
							await provider.ensureSynchronized();
							if (
								container.deltaManager.minimumSequenceNumber >= workloadSequence &&
								summaryContainer.deltaManager.minimumSequenceNumber >= workloadSequence
							) {
								break;
							}
						}
						assert(
							summaryContainer.deltaManager.minimumSequenceNumber >= workloadSequence,
							`The service must advance MSN ${summaryContainer.deltaManager.minimumSequenceNumber} through workload ${workloadSequence} before compaction`,
						);
						assert(
							container.deltaManager.minimumSequenceNumber >= workloadSequence,
							"The interactive client must acknowledge the workload before compaction",
						);
						const summaryRuntime = (summarizer as unknown as { runtime: ContainerRuntime })
							.runtime;
						const summaryEntryPoint =
							await summaryRuntime.getAliasedDataStoreEntryPoint("default");
						assert(summaryEntryPoint !== undefined);
						const summaryObject = (await summaryEntryPoint.get()) as ITestFluidObject;
						const summaryTrees = await Promise.all(
							ids.map(async (id) => summaryObject.getSharedObject<ISharedTree>(id)),
						);
						const histories = summaryTrees.map(retainedCommits);
						const localHistories = trees.map(retainedCommits);
						for (const [index, history] of histories.entries()) {
							assert.deepEqual(capturedMetadata(localHistories[index]), expectedMetadata);
							assert.deepEqual(capturedMetadata(history), expectedMetadata);
							assert.equal(
								history.length,
								initialCounts[index] + opCount + acknowledgmentCount,
							);
							assert.deepEqual(
								history.map((commit) => {
									assert(summaryObject.runtime.idCompressor !== undefined);
									return typeof commit.revision === "string"
										? commit.revision
										: summaryObject.runtime.idCompressor.decompress(commit.revision);
								}),
								localHistories[index].map((commit) => {
									assert(dataObject.runtime.idCompressor !== undefined);
									return typeof commit.revision === "string"
										? commit.revision
										: dataObject.runtime.idCompressor.decompress(commit.revision);
								}),
							);
						}
						const expected = {
							acknowledgment: acknowledgmentCount,
							rows: Array.from({ length: rowCount }, (_, id) => {
								const editedRows = Math.min(rowCount, 32);
								const lastEdit = opCount - 1 - ((opCount - 1 - id) % editedRows);
								return {
									id,
									value: id < editedRows && id < opCount ? `${lastEdit}:${payload}` : payload,
								};
							}),
						};
						for (const tree of summaryTrees) {
							const view = tree.viewWith(viewConfig);
							assert.deepEqual(TreeBeta.exportConcise(view.root), expected);
							view.dispose();
						}
						const collaborationBoundary = summaryContainer.deltaManager.minimumSequenceNumber;
						const sequenceBeforeCompaction = summaryContainer.deltaManager.lastSequenceNumber;
						const localBoundary = container.deltaManager.minimumSequenceNumber;
						const localSequence = container.deltaManager.lastSequenceNumber;
						for (const tree of trees) {
							assert.equal(tree.kernel.getLocalBranch().getHead(), tree.kernel.getTrunkHead());
						}
						const localTiming = compact(
							trees[1],
							localHistories[1].slice(0, initialCounts[1]),
							localHistories[1].slice(initialCounts[1], initialCounts[1] + opCount),
							localHistories[1].slice(initialCounts[1] + opCount),
							groupSize,
						);
						assert.deepEqual(retainedCommits(summaryTrees[1]), histories[1]);
						const summarizerTiming = compact(
							summaryTrees[1],
							histories[1].slice(0, initialCounts[1]),
							histories[1].slice(initialCounts[1], initialCounts[1] + opCount),
							histories[1].slice(initialCounts[1] + opCount),
							groupSize,
						);
						assert.equal(localTiming.pairCount, opCount - Math.ceil(opCount / groupSize));
						assert.equal(summarizerTiming.pairCount, localTiming.pairCount);
						assert.equal(container.deltaManager.lastSequenceNumber, localSequence);
						assert.equal(container.deltaManager.minimumSequenceNumber, localBoundary);
						assert.deepEqual(retainedCommits(trees[0]), localHistories[0]);
						for (const [index, tree] of trees.entries()) {
							assert.deepEqual(TreeBeta.exportConcise(views[index].root), expected);
							assert.deepEqual(capturedMetadata(retainedCommits(tree)), expectedMetadata);
						}
						assert.equal(
							summaryContainer.deltaManager.lastSequenceNumber,
							sequenceBeforeCompaction,
						);
						assert.equal(
							summaryContainer.deltaManager.minimumSequenceNumber,
							collaborationBoundary,
						);
						assert.deepEqual(retainedCommits(summaryTrees[0]), histories[0]);
						assert.deepEqual(
							capturedMetadata(retainedCommits(summaryTrees[1])),
							expectedMetadata,
						);
						for (const tree of summaryTrees) {
							const view = tree.viewWith(viewConfig);
							assert.deepEqual(TreeBeta.exportConcise(view.root), expected);
							view.dispose();
						}
						await provider.ensureSynchronized();
						assert.deepEqual(retainedCommits(trees[0]), localHistories[0]);
						assert.deepEqual(retainedCommits(summaryTrees[0]), histories[0]);
						const localBeforeSummary = (await trees[0].summarize(true)).summary;
						const localAfterSummary = (await trees[1].summarize(true)).summary;
						// Reload locally encoded blobs using the existing channel-load fixture.
						assert(dataObject.runtime.idCompressor !== undefined);
						const localRuntime = new MockFluidDataStoreRuntime({
							idCompressor: dataObject.runtime.idCompressor,
						});
						const localReload = (await factory.load(
							localRuntime,
							"local-reloaded",
							{
								deltaConnection: localRuntime.createDeltaConnection(),
								objectStorage: MockStorage.createFromSummary(localAfterSummary),
							},
							factory.attributes,
						)) as ISharedTree;
						const localReloadView = localReload.viewWith(viewConfig);
						try {
							assert.deepEqual(TreeBeta.exportConcise(localReloadView.root), expected);
							assert.deepEqual(
								capturedMetadata(retainedCommits(localReload)),
								expectedMetadata,
							);
							assert.equal(
								retainedCommits(localReload).length,
								retainedCommits(trees[1]).length,
							);
						} finally {
							localReloadView.dispose();
						}
						const { summaryTree, summaryVersion } = await summarizeNow(summarizer, {
							reason: "history compaction size",
							fullTree: true,
						});
						const loaded = await provider.loadTestContainer(config, {
							[LoaderHeader.version]: summaryVersion,
						});
						containers.push(loaded);
						const loadedObject = (await loaded.getEntryPoint()) as ITestFluidObject;
						for (const [index, id] of ids.entries()) {
							const tree = await loadedObject.getSharedObject<ISharedTree>(id);
							assert.deepEqual(capturedMetadata(retainedCommits(tree)), expectedMetadata);
							assert.equal(
								retainedCommits(tree).length,
								retainedCommits(summaryTrees[index]).length,
							);
							const view = tree.viewWith(viewConfig);
							assert.deepEqual(TreeBeta.exportConcise(view.root), expected);
							view.dispose();
						}

						const beforeSummary = channelSummary(
							summaryTree,
							summaryObject.runtime.id,
							ids[0],
						);
						const afterSummary = channelSummary(summaryTree, summaryObject.runtime.id, ids[1]);
						const measurements = [
							{
								location: "local",
								beforeSummary: localBeforeSummary,
								afterSummary: localAfterSummary,
								beforeCommits: localHistories[0].length,
								afterCommits: retainedCommits(trees[1]).length,
								timing: localTiming,
							},
							{
								location: "summarizer",
								beforeSummary,
								afterSummary,
								beforeCommits: histories[0].length,
								afterCommits: retainedCommits(summaryTrees[1]).length,
								timing: summarizerTiming,
							},
						];
						const components = [
							"totalBytes",
							"forestBytes",
							"historyBytes",
							"otherBytes",
							"customMetadataBytes",
						] as const;
						const data = measurements.map((measurement): CollectedData => {
							const { location, beforeCommits, afterCommits, timing } = measurement;
							const before = measureSummarySize(measurement.beforeSummary);
							const after = measureSummarySize(measurement.afterSummary);
							const beforeStored = measureStoredHistory(
								measurement.beforeSummary,
							).storedCommits;
							const afterStored = measureStoredHistory(measurement.afterSummary).storedCommits;
							assert.equal(beforeCommits, histories[0].length);
							assert.equal(afterCommits, retainedCommits(summaryTrees[1]).length);
							assert.equal(beforeStored, beforeCommits);
							assert.equal(afterStored, afterCommits);
							assert(before.totalBytes > 0);
							assert(Number.isFinite(timing.durationMs) && timing.durationMs >= 0);
							if (withMetadata) {
								assert(before.customMetadataBytes > 0 && after.customMetadataBytes > 0);
							} else {
								assert.equal(before.customMetadataBytes, 0);
								assert.equal(after.customMetadataBytes, 0);
							}
							const savingsBytes = before.totalBytes - after.totalBytes;
							const savingsPercent = (100 * savingsBytes) / before.totalBytes;
							// Preserve existing summarizer metric names for report consumers.
							const prefix = location === "local" ? "local." : "";
							process.stdout.write(
								[
									`\n${location}; driver: ${provider.driver.type}; workload sequence: ${workloadSequence}; MSN: ${location === "local" ? localBoundary : collaborationBoundary}`,
									"\n| Component | Before (bytes) | After (bytes) | Savings (bytes) |",
									"| --- | ---: | ---: | ---: |",
									...components.map(
										(name) =>
											`| ${name} | ${before[name]} | ${after[name]} | ${before[name] - after[name]} |`,
									),
									`\nTotal savings: ${savingsPercent.toFixed(2)}%`,
									`Summary size (decimal MB): ${(before.totalBytes / 1_000_000).toFixed(6)} -> ${(after.totalBytes / 1_000_000).toFixed(6)}`,
									"customMetadataBytes is a portion of historyBytes, not an additional component.",
									`Retained commits: ${beforeCommits} -> ${afterCommits}; persisted entries: ${beforeStored} -> ${afterStored}`,
									`Compaction: ${timing.durationMs.toFixed(3)} ms for ${timing.pairCount} pair combinations (excludes planning, test assertions, serialization and service waits)\n`,
								].join("\n"),
							);
							return [
								{
									name: `${prefix}after.totalBytes`,
									value: after.totalBytes,
									units: "bytes",
									significance: "Primary",
									type: ValueType.SmallerIsBetter,
								},
								{
									name: `${prefix}before.totalBytes`,
									value: before.totalBytes,
									units: "bytes",
								},
								{
									name: `${prefix}before.totalMB`,
									value: before.totalBytes / 1_000_000,
									units: "MB",
								},
								{
									name: `${prefix}after.totalMB`,
									value: after.totalBytes / 1_000_000,
									units: "MB",
								},
								...components
									.filter((name) => name !== "totalBytes")
									.flatMap((name) => [
										{ name: `${prefix}before.${name}`, value: before[name], units: "bytes" },
										{ name: `${prefix}after.${name}`, value: after[name], units: "bytes" },
									]),
								{
									name: `${prefix}savings.bytes`,
									value: savingsBytes,
									units: "bytes",
									type: ValueType.LargerIsBetter,
								},
								{
									name: `${prefix}savings.percent`,
									value: savingsPercent,
									units: "%",
									type: ValueType.LargerIsBetter,
								},
								{ name: `${prefix}before.commits`, value: beforeCommits, units: "count" },
								{ name: `${prefix}after.commits`, value: afterCommits, units: "count" },
								{ name: `${prefix}before.storedCommits`, value: beforeStored, units: "count" },
								{ name: `${prefix}after.storedCommits`, value: afterStored, units: "count" },
								{
									name: `${location}.compactionMs`,
									value: timing.durationMs,
									units: "ms",
									type: ValueType.SmallerIsBetter,
								},
								{ name: `${location}.pairCount`, value: timing.pairCount, units: "count" },
							];
						});
						return [...data[0], ...data[1]];
					} finally {
						for (const container of containers.reverse()) {
							container.close();
						}
					}
				},
			}).timeout(180_000);
		}
	},
);

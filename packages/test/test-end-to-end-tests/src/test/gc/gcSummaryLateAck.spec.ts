/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { bufferToString } from "@fluid-internal/client-utils";
import { LocalServerTestDriver } from "@fluid-private/test-drivers";
import {
	ITestDataObject,
	TestDataObjectType,
	describeCompat,
	itExpects,
} from "@fluid-private/test-version-utils";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { ISummarizer } from "@fluidframework/container-runtime/internal";
import { Deferred } from "@fluidframework/core-utils/internal";
import { type ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";
import {
	FetchSource,
	type ISequencedDocumentMessage,
	MessageType,
} from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import { gcBlobPrefix, gcTreeKey } from "@fluidframework/runtime-definitions/internal";
import { seqFromTree } from "@fluidframework/runtime-utils/internal";
import {
	type ITestObjectProvider,
	type ITestContainerConfig,
	createSummarizer,
	summarizeNow,
	timeoutAwait,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { defaultGCConfig } from "./gcTestConfigs.js";
import { getGCStateFromSummary } from "./gcTestSummaryUtils.js";

interface AckProducer {
	send(messages: object[], topic: string): Promise<unknown>;
}

function hasOrdererManager(server: object): server is {
	ordererManager: { getOrderer(tenantId: string, documentId: string): Promise<unknown> };
} {
	if (!("ordererManager" in server)) {
		return false;
	}
	const manager = server.ordererManager;
	return (
		typeof manager === "object" &&
		manager !== null &&
		"getOrderer" in manager &&
		typeof manager.getOrderer === "function"
	);
}

function hasAckProducer(orderer: unknown): orderer is { rawDeltasKafka: AckProducer } {
	if (typeof orderer !== "object" || orderer === null || !("rawDeltasKafka" in orderer)) {
		return false;
	}
	const producer = orderer.rawDeltasKafka;
	return (
		typeof producer === "object" &&
		producer !== null &&
		"send" in producer &&
		typeof producer.send === "function"
	);
}

async function getAckProducer(
	driver: LocalServerTestDriver,
	container: IContainer,
	documentId: string,
): Promise<AckProducer> {
	assert(container.resolvedUrl !== undefined, "Expected an attached container");
	const [, tenantId, resolvedDocumentId] = new URL(container.resolvedUrl.url).pathname.split(
		"/",
	);
	assert(
		tenantId !== undefined && resolvedDocumentId === documentId,
		"Unexpected document URL",
	);
	// The local test driver runs a published Local Server; reach its existing per-document producer.
	const server = driver.server;
	assert(hasOrdererManager(server), "Local Server orderer manager is unavailable");
	const orderer = await server.ordererManager.getOrderer(tenantId, documentId);
	assert(hasAckProducer(orderer), "Local Server raw-deltas producer is unavailable");
	return orderer.rawDeltasKafka;
}

function getAckProposalSequenceNumber(
	message: object,
	documentId: string,
): number | undefined {
	if (
		!("documentId" in message) ||
		message.documentId !== documentId ||
		!("operation" in message)
	) {
		return undefined;
	}
	const operation = message.operation;
	if (
		typeof operation !== "object" ||
		operation === null ||
		!("type" in operation) ||
		operation.type !== MessageType.SummaryAck
	) {
		return undefined;
	}
	assert(
		"contents" in operation &&
			typeof operation.contents === "object" &&
			operation.contents !== null &&
			"summaryProposal" in operation.contents,
		"Malformed service summary ACK",
	);
	const proposal = operation.contents.summaryProposal;
	assert(
		typeof proposal === "object" &&
			proposal !== null &&
			"summarySequenceNumber" in proposal &&
			typeof proposal.summarySequenceNumber === "number",
		"Malformed service summary proposal",
	);
	return proposal.summarySequenceNumber;
}

/** Compare GC references without depending on when a new summarizer marks a node unreferenced. */
function gcGraph(state: NonNullable<ReturnType<typeof getGCStateFromSummary>>) {
	return Object.fromEntries(
		Object.entries(state.gcNodes).map(([id, node]) => [
			id,
			{
				outboundRoutes: [...node.outboundRoutes].sort(),
				isUnreferenced: node.unreferencedTimestampMs !== undefined,
			},
		]),
	);
}

describeCompat(
	"GC summary after a late service ACK",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		let provider: ITestObjectProvider;

		function getSummarizerRuntime(summarizer: ISummarizer) {
			assert(
				"runtime" in summarizer &&
					summarizer.runtime instanceof apis.containerRuntime.ContainerRuntime,
				"Expected a current ContainerRuntime on the summarizer",
			);
			return summarizer.runtime;
		}

		beforeEach(function () {
			provider = getTestObjectProvider({ syncSummarizer: true });
			if (!(provider.driver instanceof LocalServerTestDriver)) {
				this.skip();
			}
		});

		itExpects(
			"writes changed GC data after a timed-out proposal is acknowledged following a failed retry",
			[
				{ eventName: "fluid:telemetry:Summarizer:Running:SummaryAckWaitTimeout" },
				{
					eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
					error: "summaryAckWaitTimeout: Timeout while waiting for summaryAck/summaryNack op",
				},
				{
					eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed",
					error: "summaryAckWaitTimeout: Timeout while waiting for summaryAck/summaryNack op",
				},
				{
					eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
					error: "Upload summary failed in test",
				},
				{
					eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed",
					error: "Upload summary failed in test",
				},
			],
			async function () {
				this.timeout(60_000);
				assert(
					provider.driver instanceof LocalServerTestDriver,
					"Expected a local test driver",
				);
				const mainContainer = await provider.makeTestContainer(defaultGCConfig);
				const mainDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
				const runtime = mainDataStore._context.containerRuntime;
				const dataStoreB = (await (
					await runtime.createDataStore(TestDataObjectType)
				).entryPoint.get()) as ITestDataObject;
				const dataStoreC = (await (
					await runtime.createDataStore(TestDataObjectType)
				).entryPoint.get()) as ITestDataObject;
				mainDataStore._root.set("dataStoreB", dataStoreB.handle);
				mainDataStore._root.set("dataStoreC", dataStoreC.handle);
				await waitForContainerConnection(mainContainer);
				await provider.ensureSynchronized();

				const summarizerConfig: ITestContainerConfig = {
					runtimeOptions: {
						summaryOptions: {
							summaryConfigOverrides: {
								state: "disableHeuristics",
								maxAckWaitTime: 5000,
								maxOpsSinceLastSummary: 7000,
								initialSummarizerDelayMs: 0,
							},
						},
					},
				};
				const { container: summarizerContainer, summarizer } = await createSummarizer(
					provider,
					mainContainer,
					summarizerConfig,
				);
				await summarizeNow(summarizer);

				// Hold the server's ACK request before Deli assigns it a sequence number.
				const producer = await getAckProducer(
					provider.driver,
					mainContainer,
					provider.documentId,
				);
				const originalSend = producer.send;
				const heldAck = new Deferred<number>();
				const releaseAck = new Deferred<void>();
				let ackHeld = false;
				producer.send = async (messages, topic) => {
					const proposalSequenceNumber =
						messages.length === 1
							? getAckProposalSequenceNumber(messages[0], provider.documentId)
							: undefined;
					if (!ackHeld && proposalSequenceNumber !== undefined) {
						ackHeld = true;
						heldAck.resolve(proposalSequenceNumber);
						await releaseAck.promise;
					}
					await originalSend.call(producer, messages, topic);
				};

				try {
					mainDataStore._root.delete("dataStoreB");
					await provider.ensureSynchronized();
					const summaryA = summarizer.summarizeOnDemand({
						reason: "capture GC state before late ACK",
						retryOnFailure: false,
					});
					const submittedA = await summaryA.summarySubmitted;
					assert(submittedA.success && submittedA.data.stage === "submit");
					const gcA = getGCStateFromSummary(submittedA.data.summaryTree);
					assert(gcA !== undefined, "A must contain GC state");
					const broadcastA = await summaryA.summaryOpBroadcasted;
					assert(broadcastA.success);
					assert.equal(
						await timeoutAwait(heldAck.promise, {
							durationMs: 15_000,
							errorMsg: "The service did not produce A's ACK",
						}),
						broadcastA.data.summarizeOp.sequenceNumber,
						"Held ACK must belong to A",
					);

					mainDataStore._root.delete("dataStoreC");
					await provider.ensureSynchronized();
					const gcChangeSequenceNumber = summarizerContainer.deltaManager.lastSequenceNumber;
					assert(
						gcChangeSequenceNumber > broadcastA.data.summarizeOp.sequenceNumber,
						"The changed GC graph must be sequenced after A's proposal",
					);

					const timedOutA = await summaryA.receivedSummaryAckOrNack;
					assert(!timedOutA.success, "A should time out while its real ACK is held");
					assert.equal(
						timedOutA.message,
						"summaryAckWaitTimeout: Timeout while waiting for summaryAck/summaryNack op",
					);
					await new Promise<void>((resolve) => process.nextTick(resolve));

					const summarizerRuntime = getSummarizerRuntime(summarizer);
					const uploadSummary = summarizerRuntime.storage.uploadSummaryWithContext;
					let failedSummary: ISummaryTree | undefined;
					summarizerRuntime.storage.uploadSummaryWithContext = async (summary) => {
						failedSummary = summary;
						throw new Error("Upload summary failed in test");
					};
					try {
						await assert.rejects(summarizeNow(summarizer), /Upload summary failed in test/);
					} finally {
						summarizerRuntime.storage.uploadSummaryWithContext = uploadSummary;
					}
					assert(failedSummary !== undefined, "B must generate a summary before upload fails");
					const gcB = getGCStateFromSummary(failedSummary);
					assert(gcB !== undefined, "B must contain GC state");
					assert.notDeepEqual(
						gcGraph(gcB),
						gcGraph(gcA),
						"The sequenced reference change must change the GC graph",
					);

					const ackProcessed = new Deferred<string>();
					const refreshAck = summarizerRuntime.refreshLatestSummaryAck;
					let wasRetired = false;
					// Observe completion of the runtime's real ACK callback, without synthesizing an ACK.
					summarizerRuntime.refreshLatestSummaryAck = async (options) => {
						await refreshAck.call(summarizerRuntime, options);
						if (options.proposalHandle === broadcastA.data.summarizeOp.contents.handle) {
							wasRetired = options.isRetired === true;
							ackProcessed.resolve(options.ackHandle);
						}
					};
					const ackSequenced = new Deferred<number>();
					const staleSummarizerClosed = new Deferred<void>();
					const onOp = (op: ISequencedDocumentMessage): void => {
						if (op.type === MessageType.SummaryAck) {
							ackSequenced.resolve(op.sequenceNumber);
						}
					};
					const onClosed = (): void => staleSummarizerClosed.resolve();
					summarizerContainer.on("op", onOp);
					summarizerContainer.on("disposed", onClosed);
					let acceptedAckHandle: string;
					try {
						releaseAck.resolve();
						const ackSequenceNumber = await timeoutAwait(ackSequenced.promise, {
							durationMs: 15_000,
							errorMsg: "A's held ACK was not sequenced",
						});
						acceptedAckHandle = await timeoutAwait(ackProcessed.promise, {
							durationMs: 15_000,
							errorMsg: "A's late ACK did not reach the runtime",
						});
						assert(wasRetired, "A's late ACK must follow the untracked path");
						const [latestStoredVersion] = await summarizerRuntime.storage.getVersions(
							// eslint-disable-next-line unicorn/no-null -- getVersions uses null to request the latest version
							null,
							1,
							"RetiredSummaryAckTest",
							FetchSource.noCache,
						);
						assert(latestStoredVersion !== undefined, "A's accepted snapshot is missing");
						assert.equal(
							latestStoredVersion.id,
							acceptedAckHandle,
							"A's accepted snapshot must be the latest stored version",
						);
						const latestSnapshot =
							await summarizerRuntime.storage.getSnapshotTree(latestStoredVersion);
						assert(latestSnapshot !== null, "A's accepted snapshot tree is missing");
						const snapshotRefSeq = await seqFromTree(latestSnapshot, async <T>(id: string) =>
							readAndParse<T>(summarizerRuntime.storage, id),
						);
						assert(
							snapshotRefSeq >= broadcastA.data.summarizeOp.referenceSequenceNumber,
							"A's accepted snapshot must contain A's reference sequence number",
						);
						await timeoutAwait(staleSummarizerClosed.promise, {
							durationMs: 15_000,
							errorMsg: "The stale summarizer was not disposed after A's ACK",
						});
						assert(
							ackSequenceNumber > gcChangeSequenceNumber,
							"The ACK must be sequenced after the GC-relevant op",
						);
						assert(summarizerContainer.closed, "The stale summarizer must close");
					} finally {
						summarizerContainer.off("op", onOp);
						summarizerContainer.off("disposed", onClosed);
						summarizerRuntime.refreshLatestSummaryAck = refreshAck;
					}

					const { summarizer: freshSummarizer } = await createSummarizer(
						provider,
						mainContainer,
						summarizerConfig,
						acceptedAckHandle,
					);
					await provider.ensureSynchronized();
					const summaryC = await summarizeNow(freshSummarizer);
					assert.equal(summaryC.summaryTree.tree[gcTreeKey]?.type, SummaryType.Tree);
					const gcC = getGCStateFromSummary(summaryC.summaryTree);
					assert(gcC !== undefined, "C must contain GC state");
					assert.deepEqual(gcGraph(gcC), gcGraph(gcB));

					assert(mainContainer.resolvedUrl !== undefined, "Expected an attached container");
					const documentService = await provider.documentServiceFactory.createDocumentService(
						mainContainer.resolvedUrl,
						provider.logger,
					);
					const storage = await documentService.connectToStorage();
					const [version] = await storage.getVersions(summaryC.summaryVersion, 1);
					assert(version !== undefined, "Expected the accepted C version in storage");
					const snapshot = await storage.getSnapshotTree(version);
					assert(snapshot !== null, "Expected C's persisted snapshot");
					const gcBlobId = snapshot.trees[gcTreeKey]?.blobs[`${gcBlobPrefix}_root`];
					assert(gcBlobId !== undefined, "C must persist a GC state blob");
					const persistedGCState: unknown = JSON.parse(
						bufferToString(await storage.readBlob(gcBlobId), "utf-8"),
					);
					// The summary helper includes undefined timestamps, which the persisted JSON omits.
					assert.deepEqual(persistedGCState, JSON.parse(JSON.stringify(gcC)));
				} finally {
					releaseAck.resolve();
					producer.send = originalSend;
				}
			},
		);
	},
);

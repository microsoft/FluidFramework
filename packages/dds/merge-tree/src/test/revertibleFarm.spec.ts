/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

import { makeRandom } from "@fluid-private/stochastic-test-utils";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import type {
	IMergeTreeDeltaCallbackArgs,
	IMergeTreeDeltaOpArgs,
} from "../mergeTreeDeltaCallback.js";
import { walkAllChildSegments } from "../mergeTreeNodeWalk.js";
import { SegmentGroup, type ISegmentPrivate } from "../mergeTreeNodes.js";
import {
	MergeTreeDeltaRevertible,
	MergeTreeWithRevert,
	appendToMergeTreeDeltaRevertibles,
	revertMergeTreeDeltaRevertibles,
} from "../revertibles.js";

import {
	annotateRange,
	applyMessages,
	doOverRanges,
	generateOperationMessagesForClients,
	removeRange,
} from "./mergeTreeOperationRunner.js";
import { createRevertDriver } from "./testClient.js";
import { TestClientLogger, createClientsAtInitialState } from "./testClientLogger.js";

const defaultOptions = {
	initialOps: 5,
	minLength: { min: 1, max: 256, growthFunc: (i): number => i * i },
	concurrentOpsWithRevert: { min: 0, max: 8 },
	revertOps: { min: 1, max: 16 },
	ackBeforeRevert: ["None", "Some", "All"] as ("None" | "Some" | "All")[],
	rounds: 10,
	operations: [removeRange, annotateRange],
	growthFunc: (i): number => i * 2,
};

describe("MergeTree.Client", () => {
	doOverRanges(defaultOptions, ({ minLength: minLen, concurrentOpsWithRevert, revertOps }) => {
		for (const ackBeforeRevert of defaultOptions.ackBeforeRevert) {
			it(`InitialOps: ${defaultOptions.initialOps} MinLen: ${minLen}  ConcurrentOpsWithRevert: ${concurrentOpsWithRevert} RevertOps: ${revertOps} AckBeforeRevert: ${ackBeforeRevert}`, async () => {
				const random = makeRandom(
					minLen,
					revertOps,
					[...ackBeforeRevert].reduce<number>((pv, cv) => pv + (cv.codePointAt(0) ?? 0), 0),
					concurrentOpsWithRevert,
				);

				const clients = createClientsAtInitialState(
					{
						initialState: "",
						options: { mergeTreeEnableAnnotateAdjust: true },
					},
					"A",
					"B",
					"C",
				);
				let seq = 0;
				for (let rnd = 0; rnd < defaultOptions.rounds; rnd++) {
					for (const c of clients.all) c.updateMinSeq(seq);

					const logger = new TestClientLogger(clients.all, `Round ${rnd}`);
					{
						// init with random values
						const initialMsgs = generateOperationMessagesForClients(
							random,
							seq,
							clients.all,
							logger,
							defaultOptions.initialOps,
							minLen,
							defaultOptions.operations,
						);

						seq = applyMessages(seq, initialMsgs, clients.all, logger);
					}

					// cache the base text to ensure we get back to it after revert
					const undoBaseText = logger.validate({
						clear: true,
						errorPrefix: "After Initial Ops",
					});

					const clientB_Revertibles: MergeTreeDeltaRevertible[] = [];
					const clientBDriver = createRevertDriver(clients.B);
					const deltaCallback = (
						op: IMergeTreeDeltaOpArgs,
						delta: IMergeTreeDeltaCallbackArgs,
					): void => {
						if (op.sequencedMessage === undefined) {
							appendToMergeTreeDeltaRevertibles(delta, clientB_Revertibles);
						}
					};

					const msgs: [ISequencedDocumentMessage, SegmentGroup | SegmentGroup[]][] = [];
					{
						clientBDriver.submitOpCallback = (op): number =>
							msgs.push([
								clients.B.makeOpMessage(op, undefined, undefined, undefined, seq),
								// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
								clients.B.peekPendingSegmentGroups()!,
							]);
						clients.B.on("delta", deltaCallback);
						msgs.push(
							...generateOperationMessagesForClients(
								random,
								seq,
								[clients.A, clients.B],
								logger,
								revertOps,
								minLen,
								defaultOptions.operations,
							),
						);
					}

					if (concurrentOpsWithRevert > 0) {
						// add modifications from another client
						msgs.push(
							...generateOperationMessagesForClients(
								random,
								seq,
								[clients.A, clients.C],
								logger,
								concurrentOpsWithRevert,
								minLen,
								defaultOptions.operations,
							),
						);
					}

					let redoBaseText: string | undefined;
					if (ackBeforeRevert !== "None") {
						const ackAll = ackBeforeRevert === "All";
						seq = applyMessages(
							seq,
							msgs.splice(
								0,
								ackAll ? msgs.length : random.integer(0, Math.floor(msgs.length / 2)),
							),
							clients.all,
							logger,
						);
						if (ackAll) {
							redoBaseText = logger.validate({ errorPrefix: "Before Revert Ack" });
						}
					}

					try {
						revertMergeTreeDeltaRevertibles(clientBDriver, clientB_Revertibles.splice(0));
						seq = applyMessages(seq, msgs.splice(0), clients.all, logger);
					} catch (error) {
						throw logger.addLogsToError(error);
					}
					logger.validate({
						clear: true,
						baseText: concurrentOpsWithRevert === 0 ? undoBaseText : undefined,
						errorPrefix: "After Revert (undo)",
					});

					try {
						// reset the callback before the final revert
						// to avoid accruing any new detached references
						clients.B.off("delta", deltaCallback);
						revertMergeTreeDeltaRevertibles(clientBDriver, clientB_Revertibles.splice(0));
						seq = applyMessages(seq, msgs.splice(0), clients.all, logger);

						walkAllChildSegments(clients.B.mergeTree.root, (seg: ISegmentPrivate) => {
							if (seg?.trackingCollection.empty === false) {
								assert.notDeepStrictEqual(
									seg?.trackingCollection.empty,
									false,
									"there should be no left over tracking group",
								);
							}
							if (seg?.localRefs?.empty === false) {
								assert.notDeepStrictEqual(
									seg?.localRefs?.empty,
									false,
									"there should be no left over local references",
								);
							}
						});
						const mergeTreeWithRevert: Partial<MergeTreeWithRevert> = clients.B.mergeTree;
						assert.notDeepStrictEqual(
							mergeTreeWithRevert.__mergeTreeRevertible?.detachedReferences?.localRefs?.empty,
							false,
							"there should be no left over local references in detached references",
						);
					} catch (error) {
						throw logger.addLogsToError(error);
					}
					logger.validate({
						errorPrefix: "After Re-Revert (redo)",
						baseText: redoBaseText,
					});
					logger.dispose();
				}
			});
		}
	});
});

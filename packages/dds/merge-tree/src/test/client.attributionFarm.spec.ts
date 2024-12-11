/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { describeFuzz, makeRandom } from "@fluid-private/stochastic-test-utils";
import { generatePairwiseOptions } from "@fluid-private/test-pairwise-generator";
import { AttributionKey } from "@fluidframework/runtime-definitions/internal";

import { createPropertyTrackingAndInsertionAttributionPolicyFactory } from "../attributionPolicy.js";
import type { ISegmentLeaf } from "../mergeTreeNodes.js";

import {
	IConfigRange,
	IMergeTreeOperationRunnerConfig,
	TestOperation,
	generateClientNames,
	insert,
	removeRange,
	resolveRanges,
	runMergeTreeOperationRunner,
} from "./mergeTreeOperationRunner.js";
import { TestClient } from "./testClient.js";
import { TestClientLogger } from "./testClientLogger.js";

export const annotateRange: TestOperation = (
	client: TestClient,
	opStart: number,
	opEnd: number,
) => client.annotateRangeLocal(opStart, opEnd, { trackedProp: client.longClientId });

const defaultOptions: Record<"initLen" | "modLen", IConfigRange> &
	IMergeTreeOperationRunnerConfig = {
	initLen: { min: 2, max: 4 },
	modLen: { min: 1, max: 8 },
	opsPerRoundRange: { min: 10, max: 40 },
	rounds: 10,
	operations: [removeRange, annotateRange, insert],
	growthFunc: (input: number) => input * 2,
};

describeFuzz("MergeTree.Attribution", ({ testCount }) => {
	// Generate a list of single character client names, support up to 69 clients
	const clientNames = generateClientNames();
	const rangeOptions = resolveRanges(defaultOptions, defaultOptions.growthFunc);
	for (let extraSeed = 0; extraSeed < testCount; extraSeed++) {
		for (const { initLen, modLen, opsPerRoundRange } of generatePairwiseOptions(
			rangeOptions,
		)) {
			it(`AttributionFarm_${initLen}_${modLen}_${opsPerRoundRange}`, async () => {
				const random = makeRandom(0xdeadbeef, initLen, modLen, extraSeed ?? 0);

				const clients: TestClient[] = Array.from({ length: 3 })
					.fill(0)
					.map(
						() =>
							new TestClient({
								attribution: {
									track: true,
									policyFactory:
										createPropertyTrackingAndInsertionAttributionPolicyFactory("trackedProp"),
								},
							}),
					);
				for (const [i, c] of clients.entries()) c.startOrUpdateCollaboration(clientNames[i]);

				const getAttributionAtPosition = (
					client: TestClient,
					pos: number,
				):
					| {
							[name: string]: AttributionKey | undefined;
					  }
					| undefined => {
					const { segment, offset } = client.getContainingSegment<ISegmentLeaf>(pos);
					if (segment?.attribution === undefined || offset === undefined) {
						return undefined;
					}
					const { attribution } = segment;
					let channels: { [name: string]: AttributionKey | undefined } | undefined;
					const result: {
						root: AttributionKey | undefined;
						channels?: { [name: string]: AttributionKey | undefined };
					} = {
						root: attribution.getAtOffset(offset),
					};
					for (const name of attribution.channelNames) {
						(channels ??= {})[name] = attribution.getAtOffset(offset, name);
						result.channels = channels;
					}
					return channels;
				};

				const validateAnnotation = (reason: string, workload: () => void): void => {
					const preWorkload = TestClientLogger.toString(clients);
					workload();
					const attributions = Array.from({ length: clients[0].getLength() }).map((_, i) =>
						getAttributionAtPosition(clients[0], i),
					);
					for (let c = 1; c < clients.length; c++) {
						for (let i = 0; i < clients[c].getLength(); i++) {
							const attribution0 = attributions[i];
							const attributionC = getAttributionAtPosition(clients[c], i);
							if (attribution0 !== attributionC) {
								assert.deepEqual(
									attribution0,
									attributionC,
									`${reason}:\n${preWorkload}\n${TestClientLogger.toString([
										clients[0],
										clients[c],
									])}`,
								);
							}
						}
					}
				};

				let seq = 0;

				validateAnnotation("Initialize", () => {
					seq = runMergeTreeOperationRunner(random, seq, clients, initLen, defaultOptions);
				});

				validateAnnotation("After Init Zamboni", () => {
					// trigger zamboni multiple times as it is incremental
					for (let i = clients[0].getCollabWindow().minSeq; i <= seq; i++) {
						for (const c of clients) c.updateMinSeq(i);
					}
				});

				validateAnnotation("After More Ops", () => {
					seq = runMergeTreeOperationRunner(random, seq, clients, modLen, defaultOptions);
				});

				validateAnnotation("After Final Zamboni", () => {
					// trigger zamboni multiple times as it is incremental
					for (let i = clients[0].getCollabWindow().minSeq; i <= seq; i++) {
						for (const c of clients) c.updateMinSeq(i);
					}
				});
			});
		}
	}
});

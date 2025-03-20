/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "node:assert";

import { makeRandom } from "@fluid-private/stochastic-test-utils";

import { SlidingPreference, setValidateRefCount } from "../localReference.js";
import type { ISegmentPrivate } from "../mergeTreeNodes.js";
import { ReferenceType } from "../ops.js";
import { ReferencePosition } from "../referencePositions.js";

import {
	IConfigRange,
	IMergeTreeOperationRunnerConfig,
	doOverRanges,
	generateClientNames,
	removeRange,
	runMergeTreeOperationRunner,
} from "./mergeTreeOperationRunner.js";
import { TestClient } from "./testClient.js";
import { TestClientLogger } from "./testClientLogger.js";
import { validateRefCount } from "./testUtils.js";

const defaultOptions: Record<"initLen" | "modLen", IConfigRange> &
	IMergeTreeOperationRunnerConfig = {
	initLen: { min: 2, max: 256 },
	modLen: { min: 1, max: 256 },
	opsPerRoundRange: { min: 10, max: 10 },
	rounds: 10,
	operations: [removeRange],
	growthFunc: (input: number) => input * 2,
};

describe("MergeTree.Client", () => {
	beforeEach(() => {
		setValidateRefCount(validateRefCount);
	});

	afterEach(() => {
		setValidateRefCount(undefined);
	});

	// Generate a list of single character client names, support up to 69 clients
	const clientNames = generateClientNames();

	doOverRanges(defaultOptions, ({ initLen, modLen }) => {
		it(`LocalReferenceFarm_${initLen}_${modLen}`, async () => {
			const random = makeRandom(0xdeadbeef, 0xfeedbed, initLen, modLen);

			const clients: TestClient[] = Array.from({ length: 3 })
				.fill(0)
				.map(() => new TestClient());
			for (const [i, c] of clients.entries()) c.startOrUpdateCollaboration(clientNames[i]);

			let seq = 0;
			// init with random values
			seq = runMergeTreeOperationRunner(random, seq, clients, initLen, defaultOptions);
			// add local references
			const refs: ReferencePosition[][] = [];

			const validateRefs = (reason: string, workload: () => void): void => {
				const preWorkload = TestClientLogger.toString(clients);
				workload();
				for (let c = 1; c < clients.length; c++) {
					for (let r = 0; r < refs[c].length; r++) {
						const pos0 = clients[0].localReferencePositionToPosition(refs[0][r]);
						const posC = clients[c].localReferencePositionToPosition(refs[c][r]);
						if (pos0 !== posC) {
							assert.equal(
								pos0,
								posC,
								`${reason}:\n${preWorkload}\n${TestClientLogger.toString(clients)}`,
							);
						}
					}
				}
				// console.log(`${reason}:\n${preWorkload}\n${TestClientLogger.toString(clients)}`)
			};

			validateRefs("Initialize", () => {
				for (const [i, c] of clients.entries()) {
					refs.push([]);
					for (let t = 0; t < c.getLength(); t++) {
						const seg = c.getContainingSegment<ISegmentPrivate>(t);
						const forwardLref = c.createLocalReferencePosition(
							seg.segment!,
							seg.offset,
							ReferenceType.SlideOnRemove,
							{ t },
							SlidingPreference.FORWARD,
						);
						const backwardLref = c.createLocalReferencePosition(
							seg.segment!,
							seg.offset,
							ReferenceType.SlideOnRemove,
							{ t },
							SlidingPreference.BACKWARD,
						);
						refs[i].push(forwardLref, backwardLref);
					}
				}
			});

			validateRefs("After Init Zamboni", () => {
				// trigger zamboni multiple times as it is incremental
				for (let i = clients[0].getCollabWindow().minSeq; i <= seq; i++) {
					for (const c of clients) c.updateMinSeq(i);
				}
			});

			validateRefs("After More Ops", () => {
				// init with random values
				seq = runMergeTreeOperationRunner(random, seq, clients, modLen, defaultOptions);
			});

			validateRefs("After Final Zamboni", () => {
				// trigger zamboni multiple times as it is incremental
				for (let i = clients[0].getCollabWindow().minSeq; i <= seq; i++) {
					for (const c of clients) c.updateMinSeq(i);
				}
			});
		});
	});
});

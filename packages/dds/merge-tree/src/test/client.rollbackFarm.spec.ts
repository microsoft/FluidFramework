/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { makeRandom } from "@fluid-private/stochastic-test-utils";

import {
	TestOperation,
	annotateRange,
	applyMessages,
	doOverRanges,
	generateOperationMessagesForClients,
	insertAtRefPos,
	removeRange,
} from "./mergeTreeOperationRunner.js";
import { TestClientLogger, createClientsAtInitialState } from "./testClientLogger.js";

const allOperations: TestOperation[] = [removeRange, annotateRange, insertAtRefPos];

const defaultOptions = {
	minLength: { min: 1, max: 32 },
	opsPerRollbackRange: { min: 1, max: 32 },
	rounds: 10,
	opsPerRound: 10,
	operations: allOperations,
	growthFunc: (input: number): number => input * 2,
};

describe("MergeTree.Client", () => {
	doOverRanges(defaultOptions, ({ minLength, opsPerRollbackRange: opsPerRollback }) => {
		it(`RollbackFarm_${minLength} OpsPerRollback: ${opsPerRollback}`, async () => {
			const random = makeRandom(0xdeadbeef, 0xfeedbed, minLength, opsPerRollback);

			// A: readonly, B: rollback, C: rollback + edit, D: edit
			const clients = createClientsAtInitialState(
				{ initialState: "", options: { mergeTreeEnableAnnotateAdjust: true } },
				"A",
				"B",
				"C",
				"D",
			);
			let seq = 0;

			for (let round = 0; round < defaultOptions.rounds; round++) {
				for (const c of clients.all) c.updateMinSeq(seq);

				const logger = new TestClientLogger(clients.all, `Round ${round}`);

				// initialize and ack 10 random actions on either C or D
				const initialMsgs = generateOperationMessagesForClients(
					random,
					seq,
					[clients.A, clients.C, clients.D],
					logger,
					defaultOptions.opsPerRound,
					minLength,
					defaultOptions.operations,
				);
				seq = applyMessages(seq, initialMsgs, clients.all, logger);

				logger.validate();

				// generate messages to rollback on B or C, then rollback
				const rollbackMsgs = generateOperationMessagesForClients(
					random,
					seq,
					[clients.A, clients.B, clients.C],
					logger,
					opsPerRollback,
					minLength,
					defaultOptions.operations,
				);
				while (rollbackMsgs.length > 0) {
					const msg = rollbackMsgs.pop();
					// TODO: The type here is probably MergeTreeDeltaType but
					// omitting GROUP, given the typing of the rollback method.
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
					clients[msg![0].clientId!].rollback?.(
						{ type: (msg![0].contents as { type?: unknown }).type },
						msg![1],
					);
				}

				logger.validate();
				logger.dispose();
			}
		}).timeout(30 * 10000);
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "node:assert";

import { IRandom, describeFuzz, makeRandom } from "@fluid-private/stochastic-test-utils";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import { SegmentGroup } from "../mergeTreeNodes.js";
import { IMergeTreeOp } from "../ops.js";

import {
	IConfigRange,
	IMergeTreeOperationRunnerConfig,
	annotateRange,
	applyMessages,
	doOverRange,
	generateClientNames,
	insert,
	removeRange,
	runMergeTreeOperationRunner,
} from "./mergeTreeOperationRunner.js";
import { TestClient } from "./testClient.js";
import { TestClientLogger } from "./testClientLogger.js";

function applyMessagesWithReconnect(
	startingSeq: number,
	messageDatas: [ISequencedDocumentMessage, SegmentGroup | SegmentGroup[]][],
	clients: readonly TestClient[],
	logger: TestClientLogger,
	random: IRandom,
): number {
	let seq = startingSeq;
	const reconnectingClientIds =
		clients.length > 2 && random.bool()
			? [clients[1].longClientId!, clients[2].longClientId!]
			: [clients[1].longClientId!];
	const reconnectClientMsgs: Map<string, [IMergeTreeOp, SegmentGroup | SegmentGroup[]][]> =
		new Map(reconnectingClientIds.map((id) => [id, []]));
	let minSeq = 0;
	// log and apply all the ops created in the round
	while (messageDatas.length > 0) {
		const [message, sg] = messageDatas.shift()!;
		assert(message.clientId, "expected clientId to be defined");
		if (reconnectingClientIds.includes(message.clientId)) {
			reconnectClientMsgs.get(message.clientId)!.push([message.contents as IMergeTreeOp, sg]);
		} else {
			message.sequenceNumber = ++seq;
			for (const c of clients) c.applyMsg(message);
			minSeq = message.minimumSequenceNumber;
		}
	}

	const reconnectMsgs: [ISequencedDocumentMessage, SegmentGroup | SegmentGroup[]][] = [];
	for (const [clientId, messageData] of reconnectClientMsgs.entries()) {
		const client = clients.find(({ longClientId }) => longClientId === clientId)!;
		for (const [op, segmentGroup] of messageData) {
			const newMsg = client.makeOpMessage(client.regeneratePendingOp(op, segmentGroup));
			newMsg.minimumSequenceNumber = minSeq;
			// apply message doesn't use the segment group, so just pass undefined
			reconnectMsgs.push([newMsg, undefined as never]);
		}
	}

	return applyMessages(seq, reconnectMsgs, clients, logger);
}

interface IReconnectFarmConfig extends IMergeTreeOperationRunnerConfig {
	minLength: number;
	clients: IConfigRange;
}

export const defaultOptions: IReconnectFarmConfig = {
	minLength: 16,
	clients: { min: 2, max: 8 },
	opsPerRoundRange: { min: 40, max: 320 },
	rounds: 3,
	operations: [annotateRange, removeRange, insert],
	growthFunc: (input: number) => input * 2,
};

// Generate a list of single character client names, support up to 69 clients
const clientNames = generateClientNames();

function runReconnectFarmTests(opts: IReconnectFarmConfig, extraSeed?: number): void {
	doOverRange(opts.clients, opts.growthFunc.bind(opts), (clientCount) => {
		it(`ReconnectFarm_${clientCount}_${extraSeed ?? 0}`, async () => {
			const random = makeRandom(0xdeadbeef, 0xfeedbed, clientCount, extraSeed ?? 0);
			const testOpts = { ...opts };
			if (extraSeed) {
				testOpts.resultsFilePostfix ??= "";
				testOpts.resultsFilePostfix += extraSeed;
			}

			const clients: TestClient[] = [new TestClient({ mergeTreeEnableAnnotateAdjust: true })];
			for (const [i, c] of clients.entries()) c.startOrUpdateCollaboration(clientNames[i]);

			let seq = 0;
			for (const c of clients) c.updateMinSeq(seq);

			// Add double the number of clients each iteration
			const targetClients = Math.max(opts.clients.min, clientCount);
			for (let cc = clients.length; cc < targetClients; cc++) {
				const newClient = await TestClient.createFromClientSnapshot(
					clients[0],
					clientNames[cc],
				);
				clients.push(newClient);
			}

			seq = runMergeTreeOperationRunner(
				random,
				seq,
				clients,
				testOpts.minLength,
				testOpts,
				applyMessagesWithReconnect,
			);
		}).timeout(30 * 1000);
	});
}

describeFuzz("MergeTree.Client", ({ testCount }) => {
	const opts = defaultOptions;

	if (testCount > 1) {
		doOverRange(
			{ min: 0, max: testCount - 1 },
			(x) => x + 1,
			(seed) => {
				describe(`with seed ${seed}`, () => {
					runReconnectFarmTests(opts, seed);
				});
			},
		);
	} else {
		runReconnectFarmTests(opts);
	}
});

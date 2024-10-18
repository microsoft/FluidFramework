/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { describeFuzz, makeRandom } from "@fluid-private/stochastic-test-utils";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import { SegmentGroup } from "../mergeTreeNodes.js";
import { IMergeTreeOp, MergeTreeDeltaType } from "../ops.js";

import {
	IConfigRange,
	IMergeTreeOperationRunnerConfig,
	annotateRange,
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
	stashClients: readonly TestClient[],
): number {
	let seq = startingSeq;
	const reconnectClientMsgs: [IMergeTreeOp, SegmentGroup | SegmentGroup[]][] = [];
	let minSeq = 0;

	// apply ops as stashed ops except for client #1
	const stashedOps: [IMergeTreeOp, SegmentGroup | SegmentGroup[], number][] = [];
	for (const messageData of messageDatas) {
		if (messageData[0].clientId !== clients[1].longClientId) {
			const index = clients
				.map((c) => c.longClientId)
				.indexOf(messageData[0].clientId as string);
			const op = messageData[0].contents as IMergeTreeOp;
			stashClients[index].applyStashedOp(op);
			stashedOps.push([
				op,
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				stashClients[index].peekPendingSegmentGroups(
					op.type === MergeTreeDeltaType.GROUP ? op.ops.length : 1,
				)!,
				index,
			]);
		}
	}
	// this should put all stash clients (except #1) in the same state as the
	// respective normal clients, having local changes only.
	for (let i = 0; i < clients.length; ++i) {
		if (i !== 1) {
			TestClientLogger.validate([clients[i], stashClients[i]]);
		}
	}
	TestClientLogger.validate([clients[0], stashClients[1]]);

	// apply the ops to the normal clients. they will all be the same now,
	// except #1 which has local changes other clients haven't seen yet
	for (const [message, sg] of messageDatas) {
		if (message.clientId === clients[1].longClientId) {
			reconnectClientMsgs.push([message.contents as IMergeTreeOp, sg]);
		} else {
			message.sequenceNumber = ++seq;
			for (const c of clients) c.applyMsg(message);
			minSeq = message.minimumSequenceNumber;
		}
	}

	// regenerate the ops that were applied as stashed ops. this simulates resubmit()
	const regeneratedStashedOps = stashedOps.map((op) =>
		stashClients[op[2]].makeOpMessage(stashClients[op[2]].regeneratePendingOp(op[0], op[1])),
	);

	// apply the regenerated stashed ops
	let stashedOpSeq = startingSeq;
	for (const msg of regeneratedStashedOps) {
		msg.sequenceNumber = ++stashedOpSeq;
		for (const c of stashClients) c.applyMsg(msg);
	}
	// all stash and normal clients should now be in the same state,
	// except #1 (normal) which still has local changes
	TestClientLogger.validate([...clients.filter((_, i) => i !== 1), ...stashClients]);

	// regenerate ops for client #1
	const reconnectMsgs: ISequencedDocumentMessage[] = [];
	for (const opData of reconnectClientMsgs) {
		const newMsg = clients[1].makeOpMessage(
			clients[1].regeneratePendingOp(opData[0], opData[1]),
		);
		newMsg.minimumSequenceNumber = minSeq;
		reconnectMsgs.push(newMsg);
	}

	// apply regenerated ops as stashed ops for client #1
	const stashedRegeneratedOps: [IMergeTreeOp, SegmentGroup | SegmentGroup[]][] =
		reconnectMsgs.map((message) => {
			const op = message.contents as IMergeTreeOp;
			stashClients[1].applyStashedOp(op);
			return [
				op,
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				stashClients[1].peekPendingSegmentGroups(
					op.type === MergeTreeDeltaType.GROUP ? op.ops.length : 1,
				)!,
			];
		});
	// now both clients at index 1 should be the same
	TestClientLogger.validate([clients[1], stashClients[1]]);

	// apply the regenerated ops from client #1
	for (const message of reconnectMsgs) {
		message.sequenceNumber = ++seq;
		for (const c of clients) c.applyMsg(message);
	}

	// resubmit regenerated stashed ops
	const reRegeneratedStashedMessages = stashedRegeneratedOps.map((stashedOp) =>
		stashClients[1].makeOpMessage(
			stashClients[1].regeneratePendingOp(stashedOp[0], stashedOp[1]),
		),
	);

	for (const reRegeneratedStashedOp of reRegeneratedStashedMessages) {
		reRegeneratedStashedOp.sequenceNumber = ++stashedOpSeq;
		for (const c of stashClients) c.applyMsg(reRegeneratedStashedOp);
	}

	// all clients should now be the same
	TestClientLogger.validate([...clients, ...stashClients]);

	return seq;
}

interface IApplyStashedOpFarmConfig extends IMergeTreeOperationRunnerConfig {
	minLength: number;
	clients: IConfigRange;
}

export const defaultOptions: IApplyStashedOpFarmConfig = {
	minLength: 16,
	clients: { min: 3, max: 12 },
	opsPerRoundRange: { min: 40, max: 120 },
	rounds: 3,
	operations: [annotateRange, removeRange, insert],
	growthFunc: (input: number) => input * 2,
};

// Generate a list of single character client names, support up to 69 clients
const clientNames = generateClientNames();

function runApplyStashedOpFarmTests(
	opts: IApplyStashedOpFarmConfig,
	extraSeed?: number,
): void {
	doOverRange(opts.clients, opts.growthFunc.bind(opts), (clientCount) => {
		it(`applyStashedOpFarm_${clientCount}`, async () => {
			const random = makeRandom(0xdeadbeef, 0xfeedbed, clientCount, extraSeed ?? 0);
			const testOpts = { ...opts };
			if (extraSeed) {
				testOpts.resultsFilePostfix ??= "";
				testOpts.resultsFilePostfix += extraSeed;
			}

			const clients: TestClient[] = [new TestClient({ mergeTreeEnableAnnotateAdjust: true })];
			// This test is based on reconnectFarm, but we keep a second set of clients. For
			// these clients, we apply the generated ops as stashed ops, then regenerate
			// them to simulate resubmit(), then apply them. In the end, they should arrive
			// at the same state as the "normal" set of clients
			let stashClients: TestClient[] = [];

			for (const [i, c] of clients.entries()) c.startOrUpdateCollaboration(clientNames[i]);
			stashClients = [new TestClient({ mergeTreeEnableAnnotateAdjust: true })];
			for (const [i, c] of stashClients.entries())
				c.startOrUpdateCollaboration(clientNames[i]);

			let seq = 0;
			for (const c of clients) c.updateMinSeq(seq);
			for (const c of stashClients) c.updateMinSeq(seq);

			// Add double the number of clients each iteration
			const targetClients = Math.max(opts.clients.min, clientCount);
			for (let cc = clients.length; cc < targetClients; cc++) {
				const newClient = await TestClient.createFromClientSnapshot(
					clients[0],
					clientNames[cc],
				);
				clients.push(newClient);
				// add 1 stash client per normal client
				const anotherNewClient = await TestClient.createFromClientSnapshot(
					clients[0],
					clientNames[cc],
				);
				stashClients.push(anotherNewClient);
			}

			seq = runMergeTreeOperationRunner(
				random,
				seq,
				clients,
				opts.minLength,
				opts,
				(s, m, c) => applyMessagesWithReconnect(s, m, c, stashClients),
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
					runApplyStashedOpFarmTests(opts, seed);
				});
			},
		);
	} else {
		runApplyStashedOpFarmTests(opts);
	}
});

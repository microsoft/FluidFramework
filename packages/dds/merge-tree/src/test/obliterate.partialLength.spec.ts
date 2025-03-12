/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MergeTreeDeltaType } from "../ops.js";

import { TestClient } from "./testClient.js";
import {
	insertText,
	useStrictPartialLengthChecks,
	validatePartialLengths,
} from "./testUtils.js";
import { NonCollabClient } from "../constants.js";

describe("obliterate partial lengths", () => {
	let client: TestClient;
	let refSeq: number;
	let initialLocalSeq: number;
	let localClientId: number = Number.NaN;
	let remoteClientId: number = Number.NaN;
	let remoteClientId2: number = Number.NaN;

	useStrictPartialLengthChecks();

	beforeEach(() => {
		client = new TestClient({
			mergeTreeEnableObliterate: true,
		});
		client.startOrUpdateCollaboration("local");
		localClientId = client.getClientId();
		remoteClientId = client.getOrAddShortClientId("remote 1");
		remoteClientId2 = client.getOrAddShortClientId("remote 2");
		for (const char of "hello world") {
			client.applyMsg(
				client.makeOpMessage(
					client.insertTextLocal(client.getLength(), char),
					client.getCurrentSeq() + 1,
				),
			);
		}
		assert.equal(client.getText(), "hello world");
		refSeq = client.getCurrentSeq();
		initialLocalSeq = client.getCollabWindow().localSeq;
	});

	it("removes text", () => {
		assert.equal(client.getText(), "hello world");
		const localObliterateOp = client.obliterateRangeLocal(0, "hello world".length);
		assert.equal(client.getText(), "");
		const minRefSeqForLocalSeq = new Map<number, number>([
			[initialLocalSeq, refSeq],
			[initialLocalSeq + 1, refSeq + 1],
		]);
		validatePartialLengths(
			localClientId,
			client.mergeTree,
			[
				{ seq: refSeq, len: "hello world".length, localSeq: initialLocalSeq },
				{ seq: refSeq + 1, len: "".length, localSeq: initialLocalSeq + 1 },
			],
			minRefSeqForLocalSeq,
		);

		client.applyMsg(client.makeOpMessage(localObliterateOp, refSeq + 1));

		validatePartialLengths(remoteClientId, client.mergeTree, [
			{ seq: refSeq, len: "hello world".length },
			{ seq: refSeq + 1, len: "".length },
		]);
	});

	it("correctly applies local remove after local obliterate", () => {
		const localObliterateOp = client.obliterateRangeLocal(0, "hello ".length);
		const localRemoveOp = client.removeRangeLocal(0, "world".length);

		const minRefSeqForLocalSeq = new Map<number, number>([
			[initialLocalSeq, refSeq],
			[initialLocalSeq + 1, refSeq],
			[initialLocalSeq + 2, refSeq],
		]);
		validatePartialLengths(
			localClientId,
			client.mergeTree,
			[
				{ seq: refSeq, len: "hello world".length, localSeq: initialLocalSeq },
				{ seq: refSeq, len: "world".length, localSeq: initialLocalSeq + 1 },
				{ seq: refSeq, len: "".length, localSeq: initialLocalSeq + 2 },
			],
			minRefSeqForLocalSeq,
		);

		client.applyMsg(client.makeOpMessage(localObliterateOp, refSeq + 1));
		client.applyMsg(client.makeOpMessage(localRemoveOp, refSeq + 2));

		validatePartialLengths(remoteClientId, client.mergeTree, [
			{ seq: refSeq, len: "hello world".length },
			{ seq: refSeq + 1, len: "world".length },
			{ seq: refSeq + 2, len: "".length },
		]);
	});

	it("is correct for different heights", () => {
		client = new TestClient({
			mergeTreeEnableObliterate: true,
		});
		client.startOrUpdateCollaboration("local");

		for (let i = 0; i < 100; i++) {
			insertText({
				mergeTree: client.mergeTree,
				pos: 0,
				refSeq: i,
				clientId: localClientId,
				seq: i + 1,
				text: "a",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});

			validatePartialLengths(localClientId, client.mergeTree, [{ seq: i + 1, len: i + 1 }]);
			validatePartialLengths(remoteClientId, client.mergeTree, [{ seq: i + 1, len: i + 1 }]);

			refSeq += 1;
		}

		const localObliterateOp = client.obliterateRangeLocal(50, 100);

		validatePartialLengths(localClientId, client.mergeTree);

		client.applyMsg(client.makeOpMessage(localObliterateOp, refSeq + 1));

		validatePartialLengths(remoteClientId, client.mergeTree);
	});

	describe("overlapping remove+obliterate", () => {
		it("passes for local remove and remote obliterate", () => {
			const localRemoveOp = client.removeRangeLocal(0, "hello ".length);
			client.removeRangeRemote(
				0,
				"hello ".length,
				refSeq + 1,
				refSeq,
				client.getLongClientId(remoteClientId),
			);

			const minRefSeqForLocalSeq = new Map<number, number>([
				[initialLocalSeq, refSeq],
				[initialLocalSeq + 1, refSeq],
			]);
			validatePartialLengths(
				localClientId,
				client.mergeTree,
				[
					{ seq: refSeq, len: "hello world".length, localSeq: initialLocalSeq },
					{ seq: refSeq + 1, len: "world".length, localSeq: initialLocalSeq },
					{ seq: refSeq + 1, len: "world".length, localSeq: initialLocalSeq + 1 },
				],
				minRefSeqForLocalSeq,
			);

			client.applyMsg(client.makeOpMessage(localRemoveOp, refSeq + 2));

			validatePartialLengths(NonCollabClient, client.mergeTree, [
				{ seq: refSeq, len: "hello world".length },
				{ seq: refSeq + 1, len: "world".length },
				{ seq: refSeq + 2, len: "world".length },
			]);
			validatePartialLengths(remoteClientId, client.mergeTree, [
				{ seq: refSeq, len: "world".length },
				{ seq: refSeq + 1, len: "world".length },
				{ seq: refSeq + 2, len: "world".length },
			]);
		});

		it("passes for remote remove and local obliterate", () => {
			const localObliterateOp = client.obliterateRangeLocal(0, "hello ".length);
			client.removeRangeRemote(
				0,
				"hello ".length,
				refSeq + 1,
				refSeq,
				client.getLongClientId(remoteClientId),
			);

			const minRefSeqForLocalSeq = new Map<number, number>([
				[initialLocalSeq, refSeq],
				[initialLocalSeq + 1, refSeq],
			]);

			validatePartialLengths(
				localClientId,
				client.mergeTree,
				[
					{ seq: refSeq, len: "hello world".length, localSeq: initialLocalSeq },
					{ seq: refSeq + 1, len: "world".length, localSeq: initialLocalSeq },
					{ seq: refSeq + 1, len: "world".length, localSeq: initialLocalSeq + 1 },
				],
				minRefSeqForLocalSeq,
			);

			client.applyMsg(client.makeOpMessage(localObliterateOp, refSeq + 2));

			validatePartialLengths(NonCollabClient, client.mergeTree, [
				{ seq: refSeq, len: "hello world".length },
				{ seq: refSeq + 1, len: "world".length },
				{ seq: refSeq + 2, len: "world".length },
			]);
			validatePartialLengths(remoteClientId, client.mergeTree, [
				{ seq: refSeq, len: "world".length },
				{ seq: refSeq + 1, len: "world".length },
				{ seq: refSeq + 2, len: "world".length },
			]);
		});

		it("passes for remote remove and remote obliterate", () => {
			client.removeRangeRemote(
				0,
				"hello ".length,
				refSeq + 1,
				refSeq,
				client.getLongClientId(remoteClientId),
			);
			client.removeRangeRemote(
				0,
				"hello ".length,
				refSeq + 2,
				refSeq,
				client.getLongClientId(remoteClientId2),
			);

			validatePartialLengths(NonCollabClient, client.mergeTree, [
				{ seq: refSeq, len: "hello world".length },
				{ seq: refSeq + 1, len: "world".length },
				{ seq: refSeq + 2, len: "world".length },
			]);
			validatePartialLengths(remoteClientId, client.mergeTree, [
				{ seq: refSeq, len: "world".length },
				{ seq: refSeq + 1, len: "world".length },
				{ seq: refSeq + 2, len: "world".length },
			]);
			validatePartialLengths(remoteClientId2, client.mergeTree, [
				{ seq: refSeq, len: "world".length },
				{ seq: refSeq + 1, len: "world".length },
				{ seq: refSeq + 2, len: "world".length },
			]);
		});
	});

	describe("overlapping obliterate+obliterate", () => {
		it("passes for local obliterate and remote obliterate", () => {
			const localObliterateOp = client.obliterateRangeLocal(0, "hello ".length);
			client.obliterateRangeRemote(
				0,
				"hello ".length,
				refSeq + 1,
				refSeq,
				client.getLongClientId(remoteClientId),
			);

			const minRefSeqForLocalSeq = new Map<number, number>([
				[initialLocalSeq, refSeq],
				[initialLocalSeq + 1, refSeq],
			]);
			validatePartialLengths(
				localClientId,
				client.mergeTree,
				[
					{ seq: refSeq, len: "hello world".length, localSeq: initialLocalSeq },
					{ seq: refSeq + 1, len: "world".length, localSeq: initialLocalSeq },
					{ seq: refSeq + 1, len: "world".length, localSeq: initialLocalSeq + 1 },
				],
				minRefSeqForLocalSeq,
			);

			client.applyMsg(client.makeOpMessage(localObliterateOp, refSeq + 2));

			validatePartialLengths(NonCollabClient, client.mergeTree, [
				{ seq: refSeq, len: "hello world".length },
				{ seq: refSeq + 1, len: "world".length },
				{ seq: refSeq + 2, len: "world".length },
			]);
			validatePartialLengths(remoteClientId, client.mergeTree, [
				{ seq: refSeq, len: "world".length },
				{ seq: refSeq + 1, len: "world".length },
				{ seq: refSeq + 2, len: "world".length },
			]);
		});
	});

	describe("obliterate with concurrent inserts", () => {
		it("obliterates when concurrent insert in middle of string", () => {
			const localObliterateOp = client.obliterateRangeLocal(0, client.getLength());

			client.insertTextRemote(
				"hello".length,
				"more ",
				undefined,
				refSeq + 1,
				refSeq,
				client.getLongClientId(remoteClientId),
			);
			assert.equal(client.getText(), "");

			const minRefSeqForLocalSeq = new Map<number, number>([
				[initialLocalSeq, refSeq],
				// TODO: We should be able to enable this or have a solid explanation on why it returns negative lengths.
				// This particular test case should not be exercised in production, since the perspective here is actually the local default one
				// so we'll avoid going through partial lengths, but it still suggests we may have reconnect bugs in obliterate related to partial lengths
				// not reflecting an unacked obliterate's dependency on the insertion of each segment it affects.
				// [initialLocalSeq + 1, refSeq],
			]);
			validatePartialLengths(
				localClientId,
				client.mergeTree,
				[
					{ seq: refSeq, len: "hello world".length, localSeq: initialLocalSeq },
					{ seq: refSeq + 1, len: "hellomore  world".length, localSeq: initialLocalSeq },
					{ seq: refSeq + 1, len: "".length, localSeq: initialLocalSeq + 1 },
				],
				minRefSeqForLocalSeq,
			);

			client.applyMsg(client.makeOpMessage(localObliterateOp, refSeq + 2));

			validatePartialLengths(NonCollabClient, client.mergeTree, [
				{ seq: refSeq, len: "hello world".length },
				{ seq: refSeq + 1, len: "hellomore  world".length },
				{ seq: refSeq + 2, len: "".length },
			]);
			validatePartialLengths(remoteClientId, client.mergeTree, [
				{ seq: refSeq, len: "hellomore  world".length },
				{ seq: refSeq + 1, len: "hellomore  world".length },
				{ seq: refSeq + 2, len: "".length },
			]);
		});

		it("obliterate does not affect concurrent insert at start of string", () => {
			const localObliterateOp = client.obliterateRangeLocal(0, client.getLength());
			client.insertTextRemote(
				0,
				"more ",
				undefined,
				refSeq + 1,
				refSeq,
				client.getLongClientId(remoteClientId),
			);
			assert.equal(client.getText(), "more ");

			const minRefSeqForLocalSeq = new Map<number, number>([
				[initialLocalSeq, refSeq],
				[initialLocalSeq + 1, refSeq],
			]);
			validatePartialLengths(
				localClientId,
				client.mergeTree,
				[
					{ seq: refSeq, len: "hello world".length, localSeq: initialLocalSeq },
					{ seq: refSeq + 1, len: "more hello world".length, localSeq: initialLocalSeq },
					{ seq: refSeq + 1, len: "more ".length, localSeq: initialLocalSeq + 1 },
				],
				minRefSeqForLocalSeq,
			);

			client.applyMsg(client.makeOpMessage(localObliterateOp, refSeq + 2));

			validatePartialLengths(NonCollabClient, client.mergeTree, [
				{ seq: refSeq, len: "hello world".length },
				{ seq: refSeq + 1, len: "more hello world".length },
				{ seq: refSeq + 2, len: "more ".length },
			]);
			validatePartialLengths(remoteClientId, client.mergeTree, [
				{ seq: refSeq, len: "more hello world".length },
				{ seq: refSeq + 1, len: "more hello world".length },
				{ seq: refSeq + 2, len: "more ".length },
			]);
		});

		it("obliterate does not affect concurrent insert at end of string", () => {
			const localObliterateOp = client.obliterateRangeLocal(0, client.getLength());
			client.insertTextRemote(
				"hello world".length,
				"more ",
				undefined,
				refSeq + 1,
				refSeq,
				client.getLongClientId(remoteClientId),
			);
			assert.equal(client.getText(), "more ");

			validatePartialLengths(localClientId, client.mergeTree, [
				{ seq: refSeq, len: "hello world".length, localSeq: initialLocalSeq },
				{ seq: refSeq + 1, len: "hello worldmore ".length, localSeq: initialLocalSeq },
				{ seq: refSeq + 1, len: "more ".length, localSeq: initialLocalSeq + 1 },
			]);

			client.applyMsg(client.makeOpMessage(localObliterateOp, refSeq + 2));

			validatePartialLengths(NonCollabClient, client.mergeTree, [
				{ seq: refSeq, len: "hello world".length },
				{ seq: refSeq + 1, len: "hello worldmore ".length },
				{ seq: refSeq + 2, len: "more ".length },
			]);
			validatePartialLengths(remoteClientId, client.mergeTree, [
				{ seq: refSeq, len: "hello worldmore ".length },
				{ seq: refSeq + 1, len: "hello worldmore ".length },
				{ seq: refSeq + 2, len: "more ".length },
			]);
		});
	});
});

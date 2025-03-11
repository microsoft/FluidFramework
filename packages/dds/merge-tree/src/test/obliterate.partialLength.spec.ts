/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MergeTreeDeltaType } from "../ops.js";

import { TestClient } from "./testClient.js";
import {
	insertText,
	obliterateRange,
	useStrictPartialLengthChecks,
	validatePartialLengths,
} from "./testUtils.js";

describe("obliterate partial lengths", () => {
	let client: TestClient;
	let refSeq: number;
	const localClientId = 17;
	const remoteClientId = 18;

	useStrictPartialLengthChecks();

	beforeEach(() => {
		client = new TestClient({
			mergeTreeEnableObliterate: true,
		});
		client.startOrUpdateCollaboration("local");
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
	});

	it("removes text", () => {
		assert.equal(client.getText(), "hello world");
		const localObliterateOp = client.obliterateRangeLocal(0, "hello world".length);
		assert.equal(client.getText(), "");

		validatePartialLengths(localClientId, client.mergeTree, [
			{ seq: refSeq, len: "hello world".length, localSeq: refSeq },
			{ seq: refSeq + 1, len: "".length, localSeq: refSeq + 1 },
		]);

		client.applyMsg(client.makeOpMessage(localObliterateOp, refSeq + 1));

		validatePartialLengths(remoteClientId, client.mergeTree, [
			{ seq: refSeq, len: "hello world".length },
			{ seq: refSeq + 1, len: "".length },
		]);
	});

	it("correctly applies local remove after local obliterate", () => {
		const localObliterateOp = client.obliterateRangeLocal(0, "hello ".length);
		const localRemoveOp = client.removeRangeLocal(0, "world".length);

		validatePartialLengths(localClientId, client.mergeTree, [
			{ seq: refSeq, len: "hello world".length },
			{ seq: refSeq + 1, len: "world".length, localSeq: refSeq + 1 },
			{ seq: refSeq + 2, len: "".length, localSeq: refSeq + 2 },
		]);

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
			obliterateRange({
				mergeTree: client.mergeTree,
				start: 0,
				end: "hello ".length,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 1,
				opArgs: undefined as never,
			});

			validatePartialLengths(localClientId, client.mergeTree, [
				{ seq: refSeq, len: "hello world".length, localSeq: refSeq },
				{ seq: refSeq + 1, len: "world".length, localSeq: refSeq + 1 },
			]);

			client.applyMsg(client.makeOpMessage(localRemoveOp, refSeq + 1));

			validatePartialLengths(
				remoteClientId,
				client.mergeTree,
				[
					{ seq: refSeq, len: "hello world".length },
					{ seq: refSeq + 1, len: "world".length, localSeq: refSeq + 1 },
				],
				refSeq,
			);
		});

		it("passes for remote remove and local obliterate", () => {
			client.removeRangeRemote(
				0,
				"hello ".length,
				refSeq + 1,
				refSeq,
				client.getLongClientId(remoteClientId),
			);
			const localObliterateOp = client.obliterateRangeLocal(0, "hello ".length);

			validatePartialLengths(localClientId, client.mergeTree, [
				{ seq: refSeq, len: "hello world".length, localSeq: refSeq },
				{ seq: refSeq + 1, len: "world".length, localSeq: refSeq + 1 },
				{ seq: refSeq + 2, len: "world".length, localSeq: refSeq + 2 },
			]);

			client.applyMsg(client.makeOpMessage(localObliterateOp, refSeq + 2));

			validatePartialLengths(remoteClientId, client.mergeTree, [
				{ seq: refSeq, len: "hello world".length },
				{ seq: refSeq + 1, len: "hello world".length },
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
			obliterateRange({
				mergeTree: client.mergeTree,
				start: 0,
				end: "hello ".length,
				refSeq,
				clientId: remoteClientId + 1,
				seq: refSeq + 2,
				opArgs: undefined as never,
			});

			validatePartialLengths(localClientId, client.mergeTree, [
				{ seq: refSeq, len: "hello world".length },
				{ seq: refSeq + 1, len: "hello world".length },
				{ seq: refSeq + 2, len: "world".length },
			]);
			validatePartialLengths(
				remoteClientId,
				client.mergeTree,
				[
					{ seq: refSeq, len: "hello world".length },
					{ seq: refSeq + 1, len: "hello world".length },
					{ seq: refSeq + 2, len: "world".length },
				],
				0,
			);
			validatePartialLengths(
				remoteClientId + 1,
				client.mergeTree,
				[
					{ seq: refSeq, len: "hello world".length },
					{ seq: refSeq + 1, len: "hello world".length },
					{ seq: refSeq + 2, len: "world".length },
				],
				0,
			);
		});
	});

	describe("overlapping obliterate+obliterate", () => {
		it("passes for local obliterate and remote obliterate", () => {
			const localObliterateOp = client.obliterateRangeLocal(0, "hello ".length);
			obliterateRange({
				mergeTree: client.mergeTree,
				start: 0,
				end: "hello ".length,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 1,
				opArgs: undefined as never,
			});

			validatePartialLengths(localClientId, client.mergeTree, [
				{ seq: refSeq, len: "hello world".length },
				{ seq: refSeq + 1, len: "world".length },
				{ seq: refSeq + 2, len: "world".length },
			]);

			client.applyMsg(client.makeOpMessage(localObliterateOp, refSeq + 2));

			validatePartialLengths(
				remoteClientId,
				client.mergeTree,
				[
					{ seq: refSeq, len: "hello world".length },
					{ seq: refSeq + 1, len: "world".length, localSeq: refSeq + 1 },
					{ seq: refSeq + 2, len: "world".length, localSeq: refSeq + 2 },
				],
				refSeq,
			);
		});

		it("passes for remote obliterate and local obliterate", () => {
			// TODO: This test is doing some really weird stuff as-is. The operations are only overlaping because
			// the obliterateRange below doesn't go through the client, so the refSeq on the subsequent local op is interpreted
			// as concurrent (even though that would naturally not happen). In general, mixing the helpers that operate on the merge tree
			// and using the client's methods seems problematic.
			obliterateRange({
				mergeTree: client.mergeTree,
				start: 0,
				end: "hello ".length,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 1,
				opArgs: undefined as never,
			});
			const localObliterateOp = client.obliterateRangeLocal(0, "hello".length);

			validatePartialLengths(localClientId, client.mergeTree, [
				{ seq: refSeq, len: "hello world".length },
				{ seq: refSeq + 1, len: "world".length },
				{ seq: refSeq + 2, len: "world".length },
			]);

			client.applyMsg(client.makeOpMessage(localObliterateOp, refSeq + 2));

			validatePartialLengths(
				remoteClientId,
				client.mergeTree,
				[
					{ seq: refSeq, len: "hello world".length, localSeq: refSeq },
					{ seq: refSeq + 1, len: "world".length, localSeq: refSeq + 1 },
					{ seq: refSeq + 2, len: "".length, localSeq: refSeq + 2 },
				],
				refSeq,
			);
		});
	});

	describe("obliterate with concurrent inserts", () => {
		it("obliterates when concurrent insert in middle of string", () => {
			const localObliterateOp = client.obliterateRangeLocal(0, client.getLength());
			insertText({
				mergeTree: client.mergeTree,
				pos: "hello".length,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 1,
				text: "more ",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
			assert.equal(client.getText(), "");

			validatePartialLengths(localClientId, client.mergeTree, [
				{ seq: refSeq, len: "hello world".length },
				{ seq: refSeq + 1, len: "hellomore  world".length },
				{ seq: refSeq + 1, len: "".length, localSeq: refSeq + 1 },
			]);

			client.applyMsg(client.makeOpMessage(localObliterateOp, refSeq + 2));

			validatePartialLengths(
				remoteClientId,
				client.mergeTree,
				[
					{ seq: refSeq, len: "hello world".length },
					{ seq: refSeq + 1, len: "hellomore  world".length },
					{ seq: refSeq + 2, len: "".length, localSeq: refSeq + 2 },
				],
				refSeq,
			);
		});

		it("obliterate does not affect concurrent insert at start of string", () => {
			const localObliterateOp = client.obliterateRangeLocal(0, client.getLength());
			insertText({
				mergeTree: client.mergeTree,
				pos: 0,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 1,
				text: "more ",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
			assert.equal(client.getText(), "more ");

			validatePartialLengths(localClientId, client.mergeTree, [
				{ seq: refSeq, len: "hello world".length },
				{ seq: refSeq + 1, len: "more hello world".length },
				{ seq: refSeq + 1, len: "more ".length, localSeq: refSeq + 1 },
			]);

			client.applyMsg(client.makeOpMessage(localObliterateOp, refSeq + 2));

			validatePartialLengths(
				remoteClientId,
				client.mergeTree,
				[
					{ seq: refSeq, len: "hello world".length },
					{ seq: refSeq + 1, len: "more hello world".length },
					{ seq: refSeq + 2, len: "more ".length },
				],
				refSeq,
			);
		});

		it("obliterate does not affect concurrent insert at end of string", () => {
			const localObliterateOp = client.obliterateRangeLocal(0, client.getLength());
			insertText({
				mergeTree: client.mergeTree,
				pos: "hello world".length,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 1,
				text: "more ",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
			assert.equal(client.getText(), "more ");

			validatePartialLengths(localClientId, client.mergeTree, [
				{ seq: refSeq, len: "hello world".length },
				{ seq: refSeq + 1, len: "hello worldmore ".length },
				{ seq: refSeq + 1, len: "more ".length, localSeq: refSeq + 1 },
			]);

			client.applyMsg(client.makeOpMessage(localObliterateOp, refSeq + 2));

			validatePartialLengths(
				remoteClientId,
				client.mergeTree,
				[
					{ seq: refSeq, len: "hello world".length },
					{ seq: refSeq + 1, len: "hello worldmore ".length },
					{ seq: refSeq + 2, len: "more ".length },
				],
				refSeq,
			);
		});
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MergeTreeDeltaType } from "../ops";
import { TestClient } from "./testClient";
import { insertText } from "./testUtils";

describe("obliterate", () => {
	let client: TestClient;
	let refSeq: number;
	const localClientId = 17;
	const remoteClientId = localClientId + 1;

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
		client.obliterateRangeLocal(0, client.getLength());
		assert.equal(client.getText(), "");
	});

	describe("concurrent obliterate and insert", () => {
		it("removes text for obliterate then insert", () => {
			client.obliterateRange({
				start: 0,
				end: client.getLength(),
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 1,
				overwrite: false,
				opArgs: undefined as any,
			});
			insertText({
				mergeTree: client.mergeTree,
				pos: 1,
				refSeq,
				clientId: remoteClientId + 1,
				seq: refSeq + 2,
				text: "more ",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
			assert.equal(client.getText(), "");
		});
		it("removes text for insert then obliterate when deleting entire string", () => {
			insertText({
				mergeTree: client.mergeTree,
				pos: 1,
				refSeq,
				clientId: remoteClientId + 1,
				seq: refSeq + 1,
				text: "more ",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
			client.obliterateRange({
				start: 0,
				end: "hello world".length,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 2,
				overwrite: false,
				opArgs: undefined as any,
			});
			assert.equal(client.getText(), "");
		});
		it("removes text for insert then obliterate", () => {
			insertText({
				mergeTree: client.mergeTree,
				pos: 5,
				refSeq,
				clientId: remoteClientId + 1,
				seq: refSeq + 1,
				text: "more ",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
			client.obliterateRange({
				start: 1,
				end: "hello world".length,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 2,
				overwrite: false,
				opArgs: undefined as any,
			});
			assert.equal(client.getText(), "h");
		});
	});

	describe("endpoint behavior", () => {
		it("does not expand to include text inserted at start", () => {
			client.obliterateRange({
				start: 5,
				end: "hello world".length,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 1,
				overwrite: false,
				opArgs: undefined as any,
			});
			insertText({
				mergeTree: client.mergeTree,
				pos: 5,
				refSeq,
				clientId: remoteClientId + 1,
				seq: refSeq + 2,
				text: "XXX",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
			assert.equal(client.getText(), "helloXXX");
		});
		it("does not expand to include text inserted at end", () => {
			client.obliterateRange({
				start: 0,
				end: "hello".length,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 1,
				overwrite: false,
				opArgs: undefined as any,
			});
			insertText({
				mergeTree: client.mergeTree,
				pos: 5,
				refSeq,
				clientId: remoteClientId + 1,
				seq: refSeq + 2,
				text: "XXX",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
			assert.equal(client.getText(), "XXX world");
		});
	});

	describe("local obliterate with concurrent inserts", () => {
		it("removes range when pending local obliterate op", () => {
			client.obliterateRangeLocal(0, "hello world".length);
			insertText({
				mergeTree: client.mergeTree,
				pos: 1,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 2,
				text: "XXX",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
			assert.equal(client.getText(), "");
		});
	});
});

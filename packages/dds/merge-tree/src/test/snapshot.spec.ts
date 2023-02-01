/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import { ISequencedDocumentMessage, ISummaryTree } from "@fluidframework/protocol-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { MockStorage } from "@fluidframework/test-runtime-utils";
import { IMergeTreeOp } from "../ops";
import { SnapshotV1 } from "../snapshotV1";
import { IMergeTreeOptions } from "../mergeTree";
import { TestSerializer } from "./testSerializer";
import { ISegment, TestClient } from ".";

// Reconstitutes a MergeTree client from a summary
async function loadSnapshot(summary: ISummaryTree, options?: IMergeTreeOptions) {
	const services = MockStorage.createFromSummary(summary);
	const client2 = new TestClient(options);
	const runtime: Partial<IFluidDataStoreRuntime> = {
		logger: client2.logger,
		clientId: "1",
	};

	const { catchupOpsP } = await client2.load(
		runtime as IFluidDataStoreRuntime,
		services,
		new TestSerializer(),
	);
	await catchupOpsP;
	return client2;
}

// Wrapper around MergeTree client that provides a convenient SharedString-like API for tests.
class TestString {
	private client: TestClient;
	private readonly pending: ISequencedDocumentMessage[] = [];
	private seq = 0;
	private minSeq = 0;

	constructor(id: string, options?: IMergeTreeOptions) {
		this.client = new TestClient(options);
		this.client.startOrUpdateCollaboration(id);
	}

	public insert(pos: number, text: string, increaseMsn: boolean) {
		this.queue(
			this.client.insertTextLocal(pos, text, { segment: this.pending.length })!,
			increaseMsn,
		);
	}

	public append(text: string, increaseMsn: boolean) {
		this.insert(this.client.getLength(), text, increaseMsn);
	}

	public removeRange(start: number, end: number, increaseMsn: boolean) {
		this.queue(this.client.removeRangeLocal(start, end)!, increaseMsn);
	}

	// Ensures the client's text matches the `expected` string and round-trips through a snapshot
	// into a new client.  The current client is then replaced with the loaded client in the hope
	// that it will help detect corruption bugs as further ops are applied.
	public async expect(expected: string) {
		assert.equal(
			this.client.getText(),
			expected,
			"MergeTree must contain the expected text prior to applying ops.",
		);

		await this.checkSnapshot();
	}

	// Ensures the MergeTree client's contents successfully roundtrip through a snapshot.
	public async checkSnapshot(options?: IMergeTreeOptions) {
		this.applyPendingOps();
		const expectedAttributionKeys = this.client.getAllAttributionSeqs();
		const summary = this.getSummary();
		const client2 = await loadSnapshot(summary, options);

		assert.equal(
			this.client.getText(),
			client2.getText(),
			"Snapshot must produce a MergeTree with the same text as the original",
		);

		// Also check the length as weak test for non-TextSegments.
		assert.equal(
			this.client.getLength(),
			client2.getLength(),
			"Snapshot must produce a MergeTree with the same length as the original",
		);

		const actualAttributionKeys = client2.getAllAttributionSeqs();
		assert.deepEqual(
			actualAttributionKeys,
			expectedAttributionKeys,
			"Snapshot must produce a MergeTree with identical attribution as the original",
		);

		// Replace our client with the one loaded by the snapshot.
		this.client = client2;
	}

	public getSummary() {
		const snapshot = new SnapshotV1(this.client.mergeTree, this.client.logger, (id) =>
			this.client.getLongClientId(id),
		);

		snapshot.extractSync();
		return snapshot.emit(TestClient.serializer, undefined!).summary;
	}

	public getText() {
		return this.client.getText();
	}

	public applyPendingOps() {
		for (const msg of this.pending) {
			this.client.applyMsg(msg);
		}
		this.pending.splice(0, this.pending.length);
	}

	private queue(op: IMergeTreeOp, increaseMsn: boolean) {
		const refSeq = this.seq;
		const seq = ++this.seq;

		this.pending.push(
			this.client.makeOpMessage(
				op,
				seq,
				refSeq,
				this.client.longClientId,
				(this.minSeq = increaseMsn ? seq : this.minSeq),
			),
		);
	}

	public getSegment(pos: number): ISegment {
		const { segment } = this.client.getContainingSegment(pos);
		assert(segment !== undefined);
		return segment;
	}
}

function makeSnapshotSuite(options?: IMergeTreeOptions): void {
	let str: TestString;

	beforeEach(() => {
		str = new TestString("fakeId", options);
	});

	afterEach(async () => {
		// Paranoid check that ensures `str` roundtrips through snapshot/load.  This helps to catch
		// bugs that might be missed if the test case forgets to call/await `str.expect()`.
		await str.checkSnapshot();
	});

	it("excludes un-acked segments", async () => {
		str.append("0", /* increaseMsn: */ false);

		// Invoke `load/getSnapshot()` directly instead of `str.expect()` to avoid ACKing the
		// pending insert op.
		const client2 = await loadSnapshot(str.getSummary());

		// Original client has inserted text, but the one loaded from the snapshot should be empty.
		// This is because un-ACKed ops are not included in snapshots.  Instead, these ops are
		// retransmitted and applied after the snapshot has loaded.
		assert.equal(str.getText(), "0");
		assert.equal(client2.getText(), "");
	});

	it("includes segments below MSN", async () => {
		str.append("0", /* increaseMsn: */ true);
		await str.expect("0");
	});

	it("includes ACKed segments above the MSN", async () => {
		str.append("0", /* increaseMsn: */ false);
		await str.expect("0");
	});

	it("includes removals of segments above the MSN", async () => {
		str.append("0x", /* increaseMsn: */ false);
		str.removeRange(1, 2, /* increaseMsn: */ false);
		await str.expect("0");
	});

	it("includes removals above the MSN of segments below the MSN", async () => {
		str.append("0x", /* increaseMsn: */ true);
		str.removeRange(1, 2, /* increaseMsn: */ false);
		await str.expect("0");
	});

	it("can insert segments after loading removed segment", async () => {
		str.append("0x", /* increaseMsn: */ true);
		str.removeRange(1, 2, /* increaseMsn: */ false);
		await str.expect("0");
		str.append("1", /* increaseMsn: */ false);
		await str.expect("01");
	});

	it("can insert segments relative to removed segment", async () => {
		str.append("0x", /* increaseMsn: */ false);
		str.append("2", /* increaseMsn: */ false);
		str.removeRange(1, 2, /* increaseMsn: */ false);
		str.insert(1, "1", /* increaseMsn: */ false);
		str.append("3", /* increaseMsn: */ false);
		await str.expect("0123");
	});

	it("can insert segments relative to removed segment loaded from snapshot", async () => {
		str.append("0x", /* increaseMsn: */ false);
		str.append("2", /* increaseMsn: */ false);
		str.removeRange(1, 2, /* increaseMsn: */ false);

		// Note that calling str.expect() switches the underlying client to the one loaded from the snapshot.
		await str.expect("02");

		str.insert(1, "1", /* increaseMsn: */ false);
		str.append("3", /* increaseMsn: */ false);
		await str.expect("0123");
	});

	it("includes ACKed segments below MSN in body", async () => {
		for (let i = 0; i < SnapshotV1.chunkSize + 10; i++) {
			str.append(`${i % 10}`, /* increaseMsn: */ true);
		}

		await str.checkSnapshot();
	});

	it("includes ACKed segments above MSN in body", async () => {
		for (let i = 0; i < SnapshotV1.chunkSize + 10; i++) {
			str.append(`${i % 10}`, /* increaseMsn: */ false);
		}

		await str.checkSnapshot();
	});
}

describe("snapshot", () => {
	describe("with attribution", () => {
		makeSnapshotSuite({ attribution: { track: true } });
	});

	describe("without attribution", () => {
		makeSnapshotSuite({ attribution: { track: false } });
	});

	it("presence of attribution overrides merge-tree initialization value", async () => {
		const str = new TestString("id", { attribution: { track: true } });
		str.append("hello world", /* increaseMsn: */ true);
		await str.checkSnapshot({ attribution: { track: false } });
		str.insert(0, "should have attribution", false);
		str.applyPendingOps();
		assert(
			str.getSegment(0).attribution !== undefined,
			"Attribution should be created on new segments",
		);
	});

	it("lack of attribution overrides merge-tree initialization", async () => {
		const str = new TestString("id", { attribution: { track: false } });
		str.append("hello world", /* increaseMsn: */ true);
		await str.checkSnapshot({ attribution: { track: true } });
		str.insert(0, "should not have attribution", false);
		str.applyPendingOps();
		assert(
			str.getSegment(0).attribution === undefined,
			"No attribution should be created on new segments",
		);
	});
});

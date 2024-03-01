/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SnapshotV1 } from "../snapshotV1.js";
import { IMergeTreeOptions } from "../mergeTree.js";
import {
	createInsertOnlyAttributionPolicy,
	createPropertyTrackingAttributionPolicyFactory,
} from "../attributionPolicy.js";
import { loadSnapshot, TestString } from "./snapshot.utils.js";

function makeSnapshotSuite(options?: IMergeTreeOptions): void {
	describe("from an empty initial state", () => {
		let str: TestString;
		beforeEach(() => {
			str = new TestString("fakeId", options);
		});

		afterEach(async () => {
			// Paranoid check that ensures `str` roundtrips through snapshot/load.  This helps to catch
			// bugs that might be missed if the test case forgets to call/await `str.expect()`.
			await str.checkSnapshot({
				attribution: { policyFactory: createInsertOnlyAttributionPolicy },
			});
		});

		it("excludes un-acked segments", async () => {
			str.append("0", /* increaseMsn: */ false);

			// Invoke `load/getSnapshot()` directly instead of `str.expect()` to avoid ACKing the
			// pending insert op.
			const client2 = await loadSnapshot(str.getSummary(), options);

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

		it("includes obliterates above the MSN of segments below the MSN", async () => {
			str.append("0x", /* increaseMsn: */ true);
			str.obliterateRange(1, 2, /* increaseMsn: */ false);
			await str.expect("0");
		});

		it("can insert segments after loading obliterated segment", async () => {
			str.append("0x", /* increaseMsn: */ true);
			str.obliterateRange(1, 2, /* increaseMsn: */ false);
			await str.expect("0");
			str.append("1", /* increaseMsn: */ false);
			await str.expect("01");
		});

		it("can insert segments relative to obliterated segment", async () => {
			str.append("0x", /* increaseMsn: */ false);
			str.append("2", /* increaseMsn: */ false);
			str.obliterateRange(1, 2, /* increaseMsn: */ false);
			str.insert(1, "1", /* increaseMsn: */ false);
			str.append("3", /* increaseMsn: */ false);
			await str.expect("0123");
		});

		it("can insert segments relative to obliterated segment loaded from snapshot", async () => {
			str.append("0x", /* increaseMsn: */ false);
			str.append("2", /* increaseMsn: */ false);
			str.obliterateRange(1, 2, /* increaseMsn: */ false);

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

		it("recovers annotated segments", async () => {
			str.append("123", false);
			str.annotate(1, 2, { foo: 1 }, false);

			await str.checkSnapshot();
		});
	});

	describe("from a non-empty initial state", () => {
		it("includes segments submitted while detached", async () => {
			const str = new TestString("A", options, "starting text");
			await str.expect("starting text");
		});
	});
}

describe("snapshot", () => {
	describe("with attribution", () => {
		makeSnapshotSuite({
			attribution: { track: true, policyFactory: createInsertOnlyAttributionPolicy },
			mergeTreeEnableObliterate: true,
		});
	});

	describe("with attribution and custom channels", () => {
		makeSnapshotSuite({
			attribution: {
				track: true,
				policyFactory: createPropertyTrackingAttributionPolicyFactory("foo"),
			},
			mergeTreeEnableObliterate: true,
		});
	});

	describe("without attribution", () => {
		makeSnapshotSuite({
			attribution: { track: false },
			mergeTreeEnableObliterate: true,
		});
	});

	it("presence of attribution overrides merge-tree initialization value", async () => {
		const str = new TestString("id", {
			attribution: { track: true, policyFactory: createInsertOnlyAttributionPolicy },
		});
		str.append("hello world", /* increaseMsn: */ true);
		await str.checkSnapshot({
			attribution: { track: false, policyFactory: createInsertOnlyAttributionPolicy },
		});
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
		await str.checkSnapshot({
			attribution: { track: true, policyFactory: createInsertOnlyAttributionPolicy },
		});
		str.insert(0, "should not have attribution", false);
		str.applyPendingOps();
		assert(
			str.getSegment(0).attribution === undefined,
			"No attribution should be created on new segments",
		);
	});
});

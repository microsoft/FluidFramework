/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import {
	createInsertOnlyAttributionPolicy,
	createPropertyTrackingAndInsertionAttributionPolicyFactory,
	createPropertyTrackingAttributionPolicyFactory,
} from "../attributionPolicy";
import { TestClient } from "./testClient";

describe("Attribution Policy", () => {
	const localUserLongId = "localUser";
	const remoteUserLongId = "remoteUser";
	let client: TestClient;
	let seq: number = 0;
	beforeEach(() => {
		seq = 0;
	});

	function runInsertVerificationTests() {
		it("attributes segments inserted locally upon ack", () => {
			const mergeTreeOp = client.insertTextLocal(0, "123");
			assert.deepEqual(client.getAllAttributionSeqs(), [undefined, undefined, undefined]);
			client.applyMsg(client.makeOpMessage(mergeTreeOp, ++seq));
			assert.deepEqual(client.getAllAttributionSeqs(), [1, 1, 1]);
		});

		it("attributes segments inserted remotely immediately", () => {
			client.insertTextRemote(0, "123", undefined, ++seq, seq - 1, remoteUserLongId);
			assert.deepEqual(client.getAllAttributionSeqs(), [1, 1, 1]);
		});
	}

	function runAnnotateVerificationTests() {
		it("attributes local property change on ack", () => {
			client.applyMsg(client.makeOpMessage(client.insertTextLocal(0, "123"), ++seq));
			const annotateOp = client.annotateRangeLocal(1, 2, { foo: 1 }, undefined);
			assert.deepEqual(client.getAllAttributionSeqs("foo"), [
				undefined,
				undefined,
				undefined,
			]);
			client.applyMsg(client.makeOpMessage(annotateOp, ++seq));
			client.applyMsg(
				client.makeOpMessage(client.annotateRangeLocal(0, 3, { bar: 2 }, undefined), ++seq),
			);
			assert.deepEqual(client.getAllAttributionSeqs("foo"), [undefined, 2, undefined]);
		});

		it("attributes remote property changes", () => {
			client.insertTextRemote(0, "123", undefined, ++seq, seq - 1, remoteUserLongId);
			client.annotateRangeRemote(1, 2, { foo: 1 }, ++seq, seq - 1, remoteUserLongId);
			assert.deepEqual(client.getAllAttributionSeqs("foo"), [undefined, 2, undefined]);
		});

		it("uses LWW semantics for conflicting attribution of props", () => {
			client.applyMsg(client.makeOpMessage(client.insertTextLocal(0, "123"), ++seq));
			const localPropChange = client.annotateRangeLocal(1, 2, { foo: 1 }, undefined);
			client.annotateRangeRemote(1, 2, { foo: 2 }, ++seq, seq - 1, remoteUserLongId);
			assert.equal(client.getPropertiesAtPosition(1)?.foo, 1);
			// Since the value of property "foo" is from a local change, the attribution information associated with
			// it should not be updated on account of the remote op.
			assert.deepEqual(client.getAllAttributionSeqs("foo"), [
				undefined,
				undefined,
				undefined,
			]); // TODO: or [undefined, -1, undefined]
			client.applyMsg(client.makeOpMessage(localPropChange, ++seq, seq - 1, localUserLongId));
			assert.deepEqual(
				client.getAllAttributionSeqs("foo"),
				[undefined, seq, undefined],
				"property change should have been attributed to the winning, local op",
			);
			client.annotateRangeRemote(1, 2, { foo: 3 }, ++seq, seq - 1, remoteUserLongId);
			assert.deepEqual(
				client.getAllAttributionSeqs("foo"),
				[undefined, seq, undefined],
				"second property change should have been attributed to a remote change",
			);
		});

		describe("attributes properties set on a segment at insertion time", () => {
			it("for remote insertions", () => {
				client.insertTextRemote(0, "123", { foo: "bar" }, ++seq, seq - 1, remoteUserLongId);
				assert.deepEqual(client.getAllAttributionSeqs("foo"), [1, 1, 1]);
			});

			it("for local insertions", () => {
				const mergeTreeOp = client.insertTextLocal(0, "123", { foo: "bar" });
				assert.deepEqual(client.getAllAttributionSeqs("foo"), [
					undefined,
					undefined,
					undefined,
				]);
				client.applyMsg(client.makeOpMessage(mergeTreeOp, ++seq));
				assert.deepEqual(client.getAllAttributionSeqs("foo"), [1, 1, 1]);
			});
		});
	}

	describe("using insert-only attribution", () => {
		beforeEach(() => {
			client = new TestClient({
				attribution: {
					track: true,
					policyFactory: createInsertOnlyAttributionPolicy,
				},
			});
			client.startOrUpdateCollaboration(localUserLongId);
		});

		runInsertVerificationTests();

		it("ignores local property changes", () => {
			client.applyMsg(client.makeOpMessage(client.insertTextLocal(0, "123"), ++seq));
			client.applyMsg(
				client.makeOpMessage(client.annotateRangeLocal(1, 2, { foo: 1 }, undefined), ++seq),
			);
			client.applyMsg(
				client.makeOpMessage(client.annotateRangeLocal(0, 3, { bar: 2 }, undefined), ++seq),
			);
			assert.deepEqual(client.getAllAttributionSeqs(), [1, 1, 1]);
		});

		it("ignores remote property changes", () => {
			client.insertTextRemote(0, "123", undefined, ++seq, seq - 1, remoteUserLongId);
			client.annotateRangeRemote(1, 2, { foo: 1 }, ++seq, seq - 1, remoteUserLongId);
			assert.deepEqual(client.getAllAttributionSeqs(), [1, 1, 1]);
		});
	});

	describe("using foo-property-only attribution", () => {
		beforeEach(() => {
			client = new TestClient({
				attribution: {
					track: true,
					policyFactory: createPropertyTrackingAttributionPolicyFactory("foo"),
				},
			});
			client.startOrUpdateCollaboration(localUserLongId);
		});

		runAnnotateVerificationTests();

		it("ignores segments inserted locally", () => {
			const mergeTreeOp = client.insertTextLocal(0, "123");
			assert.deepEqual(client.getAllAttributionSeqs("foo"), [
				undefined,
				undefined,
				undefined,
			]);
			client.applyMsg(client.makeOpMessage(mergeTreeOp, ++seq));
			assert.deepEqual(client.getAllAttributionSeqs("foo"), [
				undefined,
				undefined,
				undefined,
			]);
		});

		it("ignores segments inserted remotely", () => {
			client.insertTextRemote(0, "123", undefined, ++seq, seq - 1, remoteUserLongId);
			assert.deepEqual(client.getAllAttributionSeqs(), [undefined, undefined, undefined]);
		});

		it("can correctly combine segment attribution on append", () => {
			client.insertTextRemote(
				0,
				"1",
				{ foo: "bar", bar: 1 },
				++seq,
				seq - 1,
				remoteUserLongId,
			);
			client.insertTextRemote(1, "2", { bar: 1 }, ++seq, seq - 1, remoteUserLongId);
			client.annotateRangeRemote(0, 1, { foo: null }, ++seq, seq - 1, remoteUserLongId);
			client.updateMinSeq(seq);
			let segmentCount = 0;
			client.walkSegments(() => {
				segmentCount++;
				return true;
			});
			assert.equal(segmentCount, 1);
			assert.deepEqual(client.getAllAttributionSeqs("foo"), [seq, undefined]);
		});
	});

	describe("using an attribution policy which tracks insertion and annotation", () => {
		beforeEach(() => {
			client = new TestClient({
				attribution: {
					track: true,
					policyFactory:
						createPropertyTrackingAndInsertionAttributionPolicyFactory("foo"),
				},
			});
			client.startOrUpdateCollaboration(localUserLongId);
		});

		runAnnotateVerificationTests();

		runInsertVerificationTests();
	});

	describe("using an attribution policy which tracks annotation of multiple properties", () => {
		beforeEach(() => {
			client = new TestClient({
				attribution: {
					track: true,
					policyFactory: createPropertyTrackingAttributionPolicyFactory("foo", "bar"),
				},
			});
			client.startOrUpdateCollaboration(localUserLongId);
		});

		it("attributes local property change on ack", () => {
			client.applyMsg(client.makeOpMessage(client.insertTextLocal(0, "123"), ++seq));
			client.applyMsg(
				client.makeOpMessage(client.annotateRangeLocal(1, 2, { foo: 1 }, undefined), ++seq),
			);
			client.applyMsg(
				client.makeOpMessage(client.annotateRangeLocal(0, 3, { bar: 2 }, undefined), ++seq),
			);
			assert.deepEqual(client.getAllAttributionSeqs("foo"), [undefined, 2, undefined]);
			assert.deepEqual(client.getAllAttributionSeqs("bar"), [3, 3, 3]);
		});
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { AttributionKey } from "@fluidframework/runtime-definitions";
import {
	createInsertOnlyAttributionPolicy,
	createPropertyTrackingAndInsertionAttributionPolicyFactory,
	createPropertyTrackingAttributionPolicyFactory,
} from "../attributionPolicy.js";
import { TestClient } from "./testClient.js";

const local: AttributionKey = { type: "local" };

describe("Attribution Policy", () => {
	const localUserLongId = "localUser";
	const remoteUserLongId = "remoteUser";
	let client: TestClient;
	let seq: number = 0;
	beforeEach(() => {
		seq = 0;
	});

	function runInsertVerificationTests() {
		it("attributes segments inserted locally", () => {
			const mergeTreeOp = client.insertTextLocal(0, "123");
			assert.deepEqual(client.getAllAttributionSeqs(), [local, local, local]);
			client.applyMsg(client.makeOpMessage(mergeTreeOp, ++seq));
			assert.deepEqual(client.getAllAttributionSeqs(), [1, 1, 1]);
		});

		it("attributes segments inserted remotely", () => {
			client.insertTextRemote(0, "123", undefined, ++seq, seq - 1, remoteUserLongId);
			assert.deepEqual(client.getAllAttributionSeqs(), [1, 1, 1]);
		});

		it("attributes insertion in a detached state", () => {
			client = new TestClient(client.mergeTree.options);
			client.insertTextLocal(0, "1", undefined);
			assert.deepEqual(client.getAllAttributionSeqs(), [{ type: "detached", id: 0 }]);
		});
	}

	function runAnnotateVerificationTests() {
		it("attributes local property changes", () => {
			client.applyMsg(client.makeOpMessage(client.insertTextLocal(0, "123"), ++seq));
			const annotateOp = client.annotateRangeLocal(1, 2, { foo: 1 });
			assert.deepEqual(client.getAllAttributionSeqs("foo"), [undefined, local, undefined]);
			client.applyMsg(client.makeOpMessage(annotateOp, ++seq));
			client.applyMsg(
				client.makeOpMessage(client.annotateRangeLocal(0, 3, { bar: 2 }), ++seq),
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
			const localPropChange = client.annotateRangeLocal(1, 2, { foo: 1 });
			client.annotateRangeRemote(0, 2, { foo: 2 }, ++seq, seq - 1, remoteUserLongId);
			const firstRemoteAnnotateSeq = seq;
			assert.equal(client.getPropertiesAtPosition(0)?.foo, 2);
			assert.equal(client.getPropertiesAtPosition(1)?.foo, 1);

			assert.deepEqual(client.getAllAttributionSeqs("foo"), [
				firstRemoteAnnotateSeq,
				local,
				undefined,
			]);
			client.applyMsg(client.makeOpMessage(localPropChange, ++seq, seq - 1, localUserLongId));
			assert.deepEqual(
				client.getAllAttributionSeqs("foo"),
				[firstRemoteAnnotateSeq, seq, undefined],
				"property change should have been attributed to the winning, local op",
			);
			client.annotateRangeRemote(1, 2, { foo: 3 }, ++seq, seq - 1, remoteUserLongId);
			assert.deepEqual(
				client.getAllAttributionSeqs("foo"),
				[firstRemoteAnnotateSeq, seq, undefined],
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
				assert.deepEqual(client.getAllAttributionSeqs("foo"), [local, local, local]);
				client.applyMsg(client.makeOpMessage(mergeTreeOp, ++seq));
				assert.deepEqual(client.getAllAttributionSeqs("foo"), [1, 1, 1]);
			});
		});

		it("attributes annotation in a detached state", () => {
			client = new TestClient(client.mergeTree.options);
			client.insertTextLocal(0, "1", undefined);
			client.annotateRangeLocal(0, 1, { foo: "bar" });
			assert.deepEqual(client.getAllAttributionSeqs("foo"), [{ type: "detached", id: 0 }]);
		});

		it("attributes annotation on insertion in a detached state", () => {
			client = new TestClient(client.mergeTree.options);
			client.insertTextLocal(0, "1", { foo: "bar" });
			assert.deepEqual(client.getAllAttributionSeqs("foo"), [{ type: "detached", id: 0 }]);
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
				client.makeOpMessage(client.annotateRangeLocal(1, 2, { foo: 1 }), ++seq),
			);
			client.applyMsg(
				client.makeOpMessage(client.annotateRangeLocal(0, 3, { bar: 2 }), ++seq),
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
				client.makeOpMessage(client.annotateRangeLocal(1, 2, { foo: 1 }), ++seq),
			);
			client.applyMsg(
				client.makeOpMessage(client.annotateRangeLocal(0, 3, { bar: 2 }), ++seq),
			);
			assert.deepEqual(client.getAllAttributionSeqs("foo"), [undefined, 2, undefined]);
			assert.deepEqual(client.getAllAttributionSeqs("bar"), [3, 3, 3]);
		});
	});
});

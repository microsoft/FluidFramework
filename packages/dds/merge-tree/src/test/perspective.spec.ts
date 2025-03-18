/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { UnassignedSequenceNumber } from "../constants.js";
import {
	LocalDefaultPerspective,
	LocalReconnectingPerspective,
	PriorPerspective,
	RemoteObliteratePerspective,
} from "../perspective.js";
import type { InsertOperationStamp, OperationStamp, RemoveOperationStamp } from "../stamps.js";

const clientId = 17;
describe("PriorPerspective", () => {
	const refSeq = 10;
	const perspective = new PriorPerspective(refSeq, clientId);
	it("sees operations from the same client", () => {
		const stamp: OperationStamp = { clientId, seq: 1 };
		assert.ok(perspective.hasOccurred(stamp));
	});

	it("sees operations at or below the refSeq", () => {
		for (let seq = 0; seq <= refSeq; seq++) {
			const stamp: OperationStamp = { clientId, seq };
			assert.ok(perspective.hasOccurred(stamp), `Failed for seq ${seq}`);
		}
	});

	it("Does not see operations from other clients above the refSeq", () => {
		const stamp: OperationStamp = { clientId: clientId + 1, seq: refSeq + 1 };
		assert.ok(!perspective.hasOccurred(stamp));
	});
});

describe("LocalReconnectingPerspective", () => {
	const refSeq = 10;
	const localSeq = 20;
	const perspective = new LocalReconnectingPerspective(refSeq, clientId, localSeq);
	it("sees operations from the same client at or below localSeq", () => {
		for (let i = 0; i <= localSeq; i++) {
			const stamp: OperationStamp = { seq: UnassignedSequenceNumber, clientId, localSeq: i };
			assert.ok(perspective.hasOccurred(stamp), `Failed for localSeq ${i}`);
		}
	});

	it("does not see operations from the same client above localSeq", () => {
		const stamp: OperationStamp = {
			seq: UnassignedSequenceNumber,
			clientId,
			localSeq: localSeq + 1,
		};
		assert.ok(!perspective.hasOccurred(stamp));
	});

	it("sees operations at or below refSeq", () => {
		for (let seq = 0; seq <= refSeq; seq++) {
			const stamp: OperationStamp = {
				seq,
				clientId: seq % 3 === 0 ? clientId : clientId + 1,
			};
			assert.ok(perspective.hasOccurred(stamp), `Failed for seq ${seq}`);
		}
	});

	it("does not see operations from other clients above refSeq", () => {
		const stamp: OperationStamp = { seq: refSeq + 1, clientId: clientId + 1 };
		assert.ok(!perspective.hasOccurred(stamp));
	});
});

describe("LocalDefaultPerspective", () => {
	const perspective = new LocalDefaultPerspective(clientId);
	it("sees all operations", () => {
		for (const id of [0, 1, 2, 3, clientId]) {
			for (const refSeq of [0, 1, 5, 100, 1000]) {
				const stamp: OperationStamp = { seq: 1, clientId: id };
				assert.ok(
					perspective.hasOccurred(stamp),
					`Failed for clientId ${id} and refSeq ${refSeq}`,
				);
			}
		}

		for (const localSeq of [0, 1, 5, 100, 1000]) {
			const stamp: OperationStamp = { seq: UnassignedSequenceNumber, clientId, localSeq };
			assert.ok(perspective.hasOccurred(stamp), `Failed for localSeq ${localSeq}`);
		}
	});
});

describe("RemoteObliteratePerspective", () => {
	const perspective = new RemoteObliteratePerspective(clientId);
	it("Sees all inserts", () => {
		for (const id of [0, 1, 2, 3, clientId]) {
			for (const refSeq of [0, 1, 5, 100, 1000]) {
				const stamp: InsertOperationStamp = { type: "insert", seq: 1, clientId: id };
				assert.ok(
					perspective.hasOccurred(stamp),
					`Failed for clientId ${id} and refSeq ${refSeq}`,
				);
			}
		}

		for (const localSeq of [0, 1, 5, 100, 1000]) {
			const stamp: InsertOperationStamp = {
				type: "insert",
				seq: UnassignedSequenceNumber,
				clientId,
				localSeq,
			};
			assert.ok(perspective.hasOccurred(stamp), `Failed for localSeq ${localSeq}`);
		}
	});

	it("Sees remote removes", () => {
		for (const id of [0, 1, 2, 3, clientId]) {
			for (const refSeq of [0, 1, 5, 100, 1000]) {
				for (const type of ["setRemove", "sliceRemove"] as const) {
					const stamp: RemoveOperationStamp = { type, seq: 1, clientId: id };
					assert.ok(
						perspective.hasOccurred(stamp),
						`Failed for clientId ${id} and refSeq ${refSeq} with ${type}`,
					);
				}
			}
		}
	});

	it("Does not see local removes", () => {
		for (const localSeq of [0, 1, 5, 100, 1000]) {
			for (const type of ["setRemove", "sliceRemove"] as const) {
				const stamp: RemoveOperationStamp = {
					type,
					seq: UnassignedSequenceNumber,
					clientId,
					localSeq,
				};
				assert.ok(!perspective.hasOccurred(stamp), `Failed for localSeq ${localSeq}`);
			}
		}
	});
});
